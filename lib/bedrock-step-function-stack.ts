import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  JsonPath, Map,
  S3JsonItemReader, DistributedMap,
  StateMachine, TaskInput, ResultWriter, IItemReader
} from 'aws-cdk-lib/aws-stepfunctions';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { BedrockInvokeModel } from 'aws-cdk-lib/aws-stepfunctions-tasks';

import { EVALUATION_CRITERIA_PROMPT } from './prompts';
import { Bucket, EventType, IBucket } from 'aws-cdk-lib/aws-s3';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import path = require('path');
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

interface ICustomItemReader extends IItemReader {
  // Optionally modify the method signature if needed
  render(): any;
}


class CustomItemReader implements ICustomItemReader {
  readonly bucket: IBucket;
  readonly resource: string;
  readonly maxItems?: number;

  constructor() {
  }

  render(): any {
      return {
        "Resource": "arn:aws:states:::s3:getObject",
        "ReaderConfig": {
          "InputType": "JSON"
        },
        "Parameters": {
          "Bucket.$": "$.bucket",
          "Key.$": "$.key",
        }
      };
  }

  providePolicyStatements(): PolicyStatement[] {
      // Implementation for providing policy statements
      return [];
  }
}

export class BedrockStepFunctionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const model = bedrock.FoundationModel.fromFoundationModelId(
      this,
      'Model',
      bedrock.FoundationModelIdentifier.ANTHROPIC_CLAUDE_INSTANT_V1,
    );

    const inputBucket = new Bucket(this, 'InputBucket', {});
    const outputBucket = new Bucket(this, 'OutputBucket', {});

    const distributedMap = new DistributedMap(this, 'Distributed Map State', {
      itemReader: new CustomItemReader(),
      resultWriter: new ResultWriter({
        bucket: outputBucket,
        prefix: 'output',
      })
    });

    const prompt = "States.Format('Human: " + EVALUATION_CRITERIA_PROMPT + ".  Assistant:', $.input, $.submission, $.criteria)";

    const task = new BedrockInvokeModel(this, 'Prompt Model', {
      model,
      stateName: 'Bedrock criteria evaluator',
      body: TaskInput.fromObject(
        {
          "prompt.$" : prompt,
          max_tokens_to_sample: 1000,
          temperature: 1,
        },
      ),
      resultSelector: {
        names: JsonPath.stringAt('$.Body.completion'),
      },
    });


    // Step Function
    const stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineName: 'bedrock-step-function-criteria-evaluator',
      definition: distributedMap.itemProcessor(task),
    });

    const lambdaRole = new Role(this, 'LambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    stateMachine.grantStartExecution(lambdaRole);
    inputBucket.grantRead(stateMachine.role)

    const triggerFunction = new PythonFunction(this, 'TriggerFunction', {
      entry: 'lambda/trigger',
      runtime: Runtime.PYTHON_3_12,
      handler: 'handler',
      index: 'index.py',
      role: lambdaRole,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
    });
    
    triggerFunction.addEventSource(new S3EventSource(inputBucket, {
      events: [EventType.OBJECT_CREATED],
      })
    );
  }
}