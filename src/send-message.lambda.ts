import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import { SQSEvent } from 'aws-lambda';
import TelegramBot from 'node-telegram-bot-api';
import { envVars } from './constants';


const parametersProvider = new SSMProvider();

export const getTelegramToken = async (): Promise<string> => {
  try {
    const token = await parametersProvider.get(
      process.env[envVars.telegramTokenParameterName]!, { decrypt: true, maxAge: 60 * 60 * 24 },
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

export const handler = async (event: SQSEvent): Promise<void> => {
  const telegramToken = await getTelegramToken();
  const bot = new TelegramBot(telegramToken, { polling: false });
  for (const record of event.Records) {
    console.log(`Processing element: ${record.body}`);
    const message = JSON.parse(record.body);
    const sentMessage = await bot.sendMessage(
      message.chatId,
      message.text,
      message.props,
    );
    console.log(`Sent message ID: ${sentMessage.message_id}`);
  }
};
