#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BedrockStepFunctionStack } from '../lib/bedrock-step-function-stack';

const app = new cdk.App();
new BedrockStepFunctionStack(app, 'BedrockStepFunctionStack', {
  env: { account: <YOUR AWS ACCOUNT>, region: 'eu-central-1' },
});