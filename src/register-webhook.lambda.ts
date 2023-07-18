import crypto from 'crypto';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import { CdkCustomResourceResponse } from 'aws-lambda';
import TelegramBot from 'node-telegram-bot-api';
import { TelegramWebhookResourceProperties } from './register-webhook';


const parametersProvider = new SSMProvider();

export const getTelegramToken = async (parameterName: string): Promise<string> => {
  try {
    const token = await parametersProvider.get(
      parameterName, { decrypt: true, maxAge: 60 * 60 * 24 },
    ) ?? null;
    if (!token) {
      throw new Error('Token is empty');
    } else {
      return token;
    }
  } catch (err) {
    console.error('Error getting parameter');
    throw err;
  }
};

interface CustomResourceEvent {
  ResourceProperties: TelegramWebhookResourceProperties;
  RequestType: 'Create' | 'Update' | 'Delete';
}


export async function handler(event: CustomResourceEvent): Promise<CdkCustomResourceResponse> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const properties: TelegramWebhookResourceProperties = event.ResourceProperties;

  try {
    const token = await getTelegramToken(properties.tokenParameterName);
    const physicalId = crypto.createHash('sha256').update(token).digest('hex');

    const bot = new TelegramBot(token);

    let response: any;

    if (event.RequestType === 'Delete') {
      response = await bot.deleteWebHook();
    } else {
      response = await bot.setWebHook(properties.webhookURL);
    }

    if (!response) {
      throw new Error(`Failed to ${event.RequestType.toLowerCase()} webhook`);
    }

    return {
      PhysicalResourceId: physicalId,
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
