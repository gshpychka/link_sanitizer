import { parse as urlparse, UrlWithParsedQuery, format as urlformat } from 'url';
import { SQSClient, SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Message, Update } from 'node-telegram-bot-api';
import { messageHandlerEnvVars } from './constants';

const sqs = new SQSClient({});

export const getUrlParamBlacklist = (): string[] => {
  return JSON.parse(process.env[messageHandlerEnvVars.urlBlackList]!);
};


export const sendCleanedUrls = async (originalMessage: Message, cleanedUrls: string[]) => {
  try {
    const messageQueueUrl = process.env[messageHandlerEnvVars.messageQueueUrl]!;
    let messageText: string;

    if (cleanedUrls.length === 1) {
      messageText = `Ось лінк без трекінгу: ${cleanedUrls}`;
    } else {
      messageText = `Ось лінки без трекінгу: ${cleanedUrls.join(', ')}`;
    }
    const message: SendMessageCommandInput = {
      QueueUrl: messageQueueUrl,
      MessageBody: JSON.stringify({
        chatId: originalMessage.chat.id,
        text: messageText,
        props: { reply_to_message_id: originalMessage.message_id },
      }),
    };
    const command = new SendMessageCommand(message);
    await sqs.send(command);
  } catch (err) {
    console.error('Error sending URLs');
    throw err;
  }
};

export const removeTrackingIfPresent = (url: string, parameterBlacklist: string[]): string | null => {
  try {

    let urlParsed: UrlWithParsedQuery = urlparse(url, true);

    let trackingPresent = false;
    const query_params = urlParsed.query;

    for (const blacklistedParameter of parameterBlacklist) {
      if (blacklistedParameter in query_params) {
        delete query_params[blacklistedParameter];
        trackingPresent = true;
      }
    }

    if (trackingPresent) {
      urlParsed.query = query_params;
      // need to set `search` to `null` because `url.format` uses it by default
      // instead of `query`
      urlParsed.search = null;
      return urlformat(urlParsed);
    } else {
      return null;
    }
  } catch (err) {
    console.error('Error removing tracking');
    throw err;
  }

};

export const extractUrls = (message: Message): string[] | null => {
  const urls = [];
  try {
    if (message?.entities) {
      for (const entity of message.entities) {
        if (entity.type == 'url') {

          urls.push(message.text!.slice(entity.offset, entity.offset + entity.length));
        }
      }
    }
  } catch (err) {
    console.error('Error extracting URLs');
  }
  return (urls.length > 0) ? urls : null;
};

export const processMessage = async (msg: Message, parameterBlacklist: string[]) => {
  const urls = extractUrls(msg);
  if (!urls) {
    console.log('Message does not contain a URL');
    return;
  }

  const cleanUrls = urls.map(
    url => removeTrackingIfPresent(
      url, parameterBlacklist,
    ),
  ).filter((x): x is string => x !== null);

  if (cleanUrls.length > 0) {
    console.log('Sending cleaned URLs');
    await sendCleanedUrls(msg, cleanUrls);
  } else {
    console.log('URLs do not need cleaning');
  }

};


export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {

    console.log(event.body);

    const update: Update = JSON.parse(event.body!);
    const parameterBlacklist = getUrlParamBlacklist();

    if (update?.message) {
      await processMessage(update.message, parameterBlacklist);
    }

    return {
      isBase64Encoded: false,
      statusCode: 200,
      body: '0',
    };
  } catch (err) {
    console.error(`Error in handler: ${JSON.stringify(err)}`);
    return {
      isBase64Encoded: false,
      statusCode: 500,
      body: '0',
    };
  }

};
