import json
import os
import boto3

def handler(event, context):
    stepfunctions = boto3.client('stepfunctions')
    state_machine_arn = os.environ['STATE_MACHINE_ARN']

    # the event is a new file on s3
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']

    state_machine_input = {
        'bucket': bucket,
        'key': key
    }

    try:
        stepfunctions.start_execution(
            stateMachineArn=state_machine_arn,
            input=state_machine_input
        )
        
        # this reponse has a AWS timestmp that is not JSON serializable so we need to convert it to a string
        return {
            'statusCode': 200,
            'body': 'Started the state machine execution.'
        }

    except Exception as e:
        raise e