import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent } from 'aws-lambda';
// import { APIGatewayProxyEvent } from 'aws-lambda';
import { Message } from 'node-telegram-bot-api';
import { envVars } from '../src/constants';
import {
  getUrlParamBlacklist,
  sendCleanedUrls,
  removeTrackingIfPresent,
  extractUrls,
  // processMessage,
  // handler,
} from '../src/handle-message.lambda';
import * as messageHandler from '../src/handle-message.lambda';

jest.mock('@aws-sdk/client-sqs');
// const fakeSQSClient = {
//   send: jest.fn(),
// };

describe('getUrlParamBlackList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('should return blacklist from env variable', () => {
    process.env[envVars.urlBlackList] = '["utm_source", "utm_medium"]';
    expect(getUrlParamBlacklist()).toEqual(['utm_source', 'utm_medium']);
  });
});

describe('sendCleanedUrls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env[envVars.messageQueueUrl] = 'http://localhost:3000/sqs';
  });

  it('should send a message with one URL', async () => {
    const mockMessage = { chat: { id: 1 }, message_id: 2 } as Message;
    const mockUrls = ['http://example.com'];
    await sendCleanedUrls(mockMessage, mockUrls);
    expect(SendMessageCommand).toHaveBeenCalledWith({
      QueueUrl: process.env[envVars.messageQueueUrl],
      MessageBody: JSON.stringify({
        chatId: mockMessage.chat.id,
        text: 'Ось лінк без трекінгу: http://example.com',
        props: { reply_to_message_id: mockMessage.message_id },
      }),
    });
  });

  it('should send a message with multiple URLs', async () => {
    const mockMessage = { chat: { id: 1 }, message_id: 2 } as Message;
    const mockUrls = ['http://example.com', 'http://another.com'];
    await sendCleanedUrls(mockMessage, mockUrls);
    expect(SendMessageCommand).toHaveBeenCalledWith({
      QueueUrl: process.env[envVars.messageQueueUrl],
      MessageBody: JSON.stringify({
        chatId: mockMessage.chat.id,
        text: 'Ось лінки без трекінгу: http://example.com, http://another.com',
        props: { reply_to_message_id: mockMessage.message_id },
      }),
    });
  });
});


describe('removeTrackingIfPresent', () => {
  it('should remove tracking parameters', () => {
    const url = 'http://example.com/?utm_source=google&utm_medium=cpc';
    const blacklist = ['utm_source', 'utm_medium'];
    const cleanedUrl = removeTrackingIfPresent(url, blacklist);
    expect(cleanedUrl).toBe('http://example.com/');
  });

  it('should leave non-blacklisted parameters as is', () => {
    const url = 'http://example.com/?utm_source=google&foo=1&utm_medium=cpc';
    const blacklist = ['utm_source', 'utm_medium'];
    const cleanedUrl = removeTrackingIfPresent(url, blacklist);
    expect(cleanedUrl).toBe('http://example.com/?foo=1');
  });

  it('should return null when no tracking parameters present', () => {
    const url = 'http://example.com/?foo=1';
    const blacklist = ['utm_source', 'utm_medium'];
    const cleanedUrl = removeTrackingIfPresent(url, blacklist);
    expect(cleanedUrl).toBe(null);
  });
});

describe('extractUrls', () => {
  it('should extract URLs from message', () => {
    const message: Message = {
      text: 'http://example.com http://another.com',
      entities: [
        { type: 'url', offset: 0, length: 18 },
        { type: 'url', offset: 19, length: 18 },
      ],
      chat: { id: 0, type: 'private' },
      message_id: 0,
      date: 0,
    };
    const urls = extractUrls(message);
    expect(urls).toEqual(['http://example.com', 'http://another.com']);
  });

  it('should return null when no URLs in message', () => {
    const message: Message = {
      text: 'No URLs here!',
      entities: [],
      chat: { id: 0, type: 'private' },
      message_id: 0,
      date: 0,
    };
    const urls = extractUrls(message);
    expect(urls).toBe(null);
  });
});

describe('processMessage function', () => {
  let msg: Message;
  let parameterBlacklist: string[];

  beforeEach(() => {
    msg = {
      message_id: 1,
      chat: {
        id: 12345,
        type: 'private',
      },
      date: 123456789,
      text: 'https://test.com?utm_source=tracking',
    };

    parameterBlacklist = ['utm_source', 'utm_medium', 'utm_campaign'];

    jest.spyOn(messageHandler, 'sendCleanedUrls').mockImplementation(async () => { });
    jest.spyOn(messageHandler, 'removeTrackingIfPresent').mockImplementation(() => 'https://test.com');
    jest.spyOn(messageHandler, 'extractUrls').mockImplementation(() => ['https://test.com?utm_source=tracking']);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip processing if no URLs are found in the message', async () => {
    jest.spyOn(messageHandler, 'extractUrls').mockReturnValueOnce(null);

    await messageHandler.processMessage(msg, parameterBlacklist);

    expect(messageHandler.extractUrls).toHaveBeenCalledWith(msg);
    expect(messageHandler.removeTrackingIfPresent).not.toHaveBeenCalled();
    expect(messageHandler.sendCleanedUrls).not.toHaveBeenCalled();
  });

  it('should skip sending if no URLs need cleaning', async () => {
    jest.spyOn(messageHandler, 'removeTrackingIfPresent').mockReturnValueOnce(null);

    await messageHandler.processMessage(msg, parameterBlacklist);

    expect(messageHandler.extractUrls).toHaveBeenCalledWith(msg);
    expect(messageHandler.removeTrackingIfPresent).toHaveBeenCalledWith('https://test.com?utm_source=tracking', parameterBlacklist);
    expect(messageHandler.sendCleanedUrls).not.toHaveBeenCalled();
  });

  it('should clean and send URLs if they need cleaning', async () => {
    await messageHandler.processMessage(msg, parameterBlacklist);

    expect(messageHandler.extractUrls).toHaveBeenCalledWith(msg);
    expect(messageHandler.removeTrackingIfPresent).toHaveBeenCalledWith('https://test.com?utm_source=tracking', parameterBlacklist);
    expect(messageHandler.sendCleanedUrls).toHaveBeenCalledWith(msg, ['https://test.com']);
  });
});


describe('handler function', () => {
  let event: APIGatewayProxyEvent;

  beforeEach(() => {
    event = {
      body: JSON.stringify({
        message: {
          message_id: 1,
          chat: {
            id: 12345,
            type: 'private',
          },
          date: 123456789,
          text: 'https://test.com?utm_source=tracking',
        },
      }),
    } as APIGatewayProxyEvent;

    jest.spyOn(messageHandler, 'getUrlParamBlacklist').mockReturnValue(['utm_source', 'utm_medium', 'utm_campaign']);
    jest.spyOn(messageHandler, 'processMessage').mockImplementation(async () => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should process message from the event body', async () => {
    const result = await messageHandler.handler(event);

    expect(messageHandler.getUrlParamBlacklist).toHaveBeenCalled();
    expect(messageHandler.processMessage).toHaveBeenCalledWith(
      {
        message_id: 1,
        chat: {
          id: 12345,
          type: 'private',
        },
        date: 123456789,
        text: 'https://test.com?utm_source=tracking',
      },
      ['utm_source', 'utm_medium', 'utm_campaign'],
    );
    expect(result).toEqual({
      isBase64Encoded: false,
      statusCode: 200,
      body: '0',
    });
  });

  it('should handle error gracefully', async () => {
    jest.spyOn(messageHandler, 'processMessage').mockImplementation(async () => { throw new Error('Test error'); });

    const result = await messageHandler.handler(event);

    expect(messageHandler.getUrlParamBlacklist).toHaveBeenCalled();
    expect(messageHandler.processMessage).toHaveBeenCalledWith(
      {
        message_id: 1,
        chat: {
          id: 12345,
          type: 'private',
        },
        date: 123456789,
        text: 'https://test.com?utm_source=tracking',
      },
      ['utm_source', 'utm_medium', 'utm_campaign'],
    );
    expect(result).toEqual({
      isBase64Encoded: false,
      statusCode: 500,
      body: '0',
    });
  });

  const eventWithoutMessage = {
    body: JSON.stringify({}),
  } as APIGatewayProxyEvent;

  it('should not process message if it does not exist in event body', async () => {
    const result = await messageHandler.handler(eventWithoutMessage);

    expect(messageHandler.getUrlParamBlacklist).toHaveBeenCalled();
    expect(messageHandler.processMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      isBase64Encoded: false,
      statusCode: 200,
      body: '0',
    });
  });
});
