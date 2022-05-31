import json
import os

def handler(event, context):
    # Get environment variables not included in standard response.
    event['region'] = os.getenv("AWS_REGION", 'no-region')
    event['execution_environment'] = os.getenv("AWS_EXECUTION_ENV", 'no-executionenv')
    # ...and get everything else in the event.
    event_string = json.dumps(event)

    # Now, send a 200 and include our event details.
    response = {
        'statusCode': 200,
        'body': event_string
    }

    # Ensure that this function can be called from anywhere (CORS headers).
    response["headers"] = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    }

    # Return our response object.
    return response

