import { SQSEvent, SQSRecord } from 'aws-lambda';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import { envVars } from '../src/constants';
import * as handler from '../src/send-message.lambda';

jest.spyOn(handler, 'getTelegramToken').mockImplementation(async () => 'testToken');

const sendMessageMock = jest.spyOn(
  TelegramBot.prototype, 'sendMessage',
).mockResolvedValue({ message_id: 123 } as Message);

describe('handler function', () => {
  const sqsEvent: SQSEvent = {
    Records: [
      {
        body: JSON.stringify({
          chatId: '123456',
          text: 'Test message',
          props: {},
        }),
      } as SQSRecord,
    ],
  };

  afterEach(() => {
    sendMessageMock.mockClear();
  });

  afterAll(() => {
    sendMessageMock.mockRestore();
  });

  it('should get Telegram token and process all records from the event', async () => {
    // getTelegramToken is not being tested yet
    // this is has no effect for now
    // TODO: mock AWS SDK
    process.env[envVars.telegramTokenParameterName] = 'MyToken';
    await handler.handler(sqsEvent);

    expect(handler.getTelegramToken).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      '123456',
      'Test message',
      {},
    );
  });

  it('should handle errors gracefully', async () => {
    jest.spyOn(handler, 'getTelegramToken').mockImplementation(
      async () => { throw new Error('Test error'); },
    );

    try {
      await handler.handler(sqsEvent);
    } catch (err) {
      expect(err).toEqual(new Error('Test error'));
    }

    expect(handler.getTelegramToken).toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
