import { TelegramClient } from 'telegram';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import Byteroo, { Container } from 'byteroo';
import { Entity } from 'telegram/define';
import extractDisplayName from './helpers/extractDisplayName';
import ask from './helpers/ask';
import JsonSerializer from './helpers/JsonSerializer';
import checkbox from '@inquirer/checkbox';
import getInputFilter from './helpers/getInputFilter';
import getFilenameExtension from './helpers/getFilenameExtension';
import MediaType from './types/MediaType';
import { ThreadQuery, ChatQuery, MenuOption, ResumeOption } from './types/InquirerTypes';
import { LogLevel } from 'telegram/extensions/Logger';
import cliProgress from 'cli-progress';

interface ForumTopicsRequest {
  channel: Entity;
  topics: number[];
}

interface ForumTopicsResponse {
  topics: any[];
  messages: any[];
  chats: any[];
  users: any[];
  pts: number;
}


class TelegramBulkDownloader {
  private storage: Byteroo;
  private credentials: Container;
  private state: Container;
  isDownloading: boolean;
  private SIGINT: boolean;
  private client?: TelegramClient;
  constructor() {
    this.storage = new Byteroo({
      name: 'TelegramBulkDownloader',
      autocommit: true,
    });
    this.credentials = this.storage.getContainerSync(
      'credentials'
    ) as Container;
    this.state = this.storage.getContainerSync('state') as Container;
    this.isDownloading = false;
    this.SIGINT = false;
  }

  private async newDownload() {
    if (!this.client) throw new Error('TelegramClient undefined');
    const query = await inquirer.prompt<ChatQuery>([
      {
        name: 'id',
        message: 'Please enter username or chat id of target: ',
      },
    ]);

    try {
      const res = await this.client.getEntity(query.id);
      
      // Check if this is actually a forum first
      const isForumTopic: ForumTopicsResponse | boolean = await this.client.invoke(
          new Api.channels.GetForumTopicsByID({
              channel: await this.client.getInputEntity(res),
              topics: [1] // Test with a dummy topic ID
          })
      ).catch(error => {
          if (error.message.includes('CHANNEL_FORUM_MISSING')) {
              return false;
          }
          return true;
      });

      // Only show thread prompt if it's a forum
      const threadQuery = isForumTopic ? await inquirer.prompt<ThreadQuery>([
          {
              name: 'useThread',
              type: 'confirm',
              message: 'This is a forum. Do you want to download from a specific topic?',
          },
          {
              name: 'threadId',
              message: 'Enter the topic ID:',
              type: 'number',
              when: (answers) => answers.useThread,
              validate: async (input) => {
                  if (input <= 0) return 'Topic ID must be a positive number';
                  try {
                      const topicCheck = await this.client!.invoke(
                          new Api.channels.GetForumTopicsByID({
                              channel: await this.client!.getInputEntity(res),
                              topics: [Number(input)]
                          })
                      );
                      return topicCheck?.topics?.length > 0 || 'Topic ID not found';
                  } catch (error) {
                      return 'Invalid topic ID';
                  }
              }
          }
      ]) : { useThread: false, threadId: undefined };

      const { metadata } = await inquirer.prompt([
        {
          name: 'metadata',
          message: 'Do you want to include metadata.json? (Recommended: no)',
          type: 'confirm',
        },
      ]);
      let mediaTypes: MediaType[] = [];
      while (mediaTypes.length <= 0) {
        mediaTypes = await checkbox({
          message: 'Select media types to download',
          choices: [
            { name: 'Pictures', value: 'InputMessagesFilterPhotos' },
            { name: 'Videos', value: 'InputMessagesFilterVideo' },
            { name: 'Documents', value: 'InputMessagesFilterDocument' },
            { name: 'Music', value: 'InputMessagesFilterMusic' },
            { name: 'Voice messages', value: 'InputMessagesFilterVoice' },
            { name: 'GIFs', value: 'InputMessagesFilterGif' },
          ],
        });
      }
      const outPath = await ask('Enter the folder path for file storage: ');
      this.state.set(res.id.toString(), {
        displayName: extractDisplayName(res),
        entityJson: res.toJSON(),
        outPath: path.resolve(outPath),
        metadata,
        mediaTypes: mediaTypes.map((e) => ({ type: e, offset: 0 })),
        originalId: query.id,
        threadId: threadQuery.threadId 

      });
      await this.download(res);
    } catch (err) {
      console.error('Failed to retrieve chat', err);
      this.main();
    }
  }

  private async download(entity: Entity) {
    if (!this.client) throw new Error('TelegramClient undefined');
    const id = entity.id.toString();

    for (const mediaType of this.state.get(id).mediaTypes) {
      await this.downloadMediaType(entity, mediaType.type);
    }

    this.state.remove(id);
    await this.state.commit();
    process.exit(0);
  }

  private async downloadMediaType(entity: Entity, mediaType: MediaType) {
    if (!this.client) throw new Error('TelegramClient undefined');
    this.isDownloading = true;
    const id = entity.id.toString();

    // Initialize metadata handling once, outside the loop
    const metadataOption = this.state.get(id).metadata;
    let jsonSerializer;
    if (metadataOption) {
        jsonSerializer = new JsonSerializer(
            path.join(this.state.get(id).outPath, 'metadata.json')
        );
    }

    const downloadDir = this.state.get(id).outPath;
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    while (true) {
        let offset = this.state
            .get(id)
            .mediaTypes.find((e: any) => e.type === mediaType).offset;

        // Use messages.search to get messages from the specific topic
        const result = await this.client.invoke(
            new Api.messages.Search({
                peer: entity,
                q: '', // empty search query
                filter: getInputFilter(mediaType),
                minDate: 0,
                maxDate: 0,
                offsetId: offset,
                addOffset: 0,
                limit: 100,
                maxId: 0,
                minId: 0,
                hash: 0 as any,
                topMsgId: Number(this.state.get(id).threadId), // This is key for topic filtering
                fromId: undefined
            })
        ) as { messages: any[] }; // Type assertion for result

        const mediaMessages = result.messages;

        // Break if no more messages
        if (!mediaMessages.length) {
            break;
        }

        let msgId = offset;
        for (const msg of mediaMessages) {
            const bar = new cliProgress.SingleBar(
                {
                    format: `${msg.id}.${getFilenameExtension(
                        msg
                    )} {bar} {percentage}% | ETA: {eta}s`,
                },
                cliProgress.Presets.legacy
            );
            bar.start(100, 0);
            try {
                const buffer = await this.client.downloadMedia(msg, {
                    progressCallback: (downloaded, total) => {
                        if (this.SIGINT)
                            throw new Error(`Aborting download, SIGINT=true`);
                        const ratio = Number(downloaded) / Number(total);
                        const progress = Math.round(Number(ratio) * 100);
                        bar.update(progress);
                    },
                });
                bar.update(100);
                bar.stop();
                const filePath = path.join(
                    downloadDir,
                    `${msg.id}.${getFilenameExtension(msg)}`
                );
                fs.writeFileSync(filePath, buffer as any);
                msgId = msg.id;
            } catch (err) {
                console.warn(err);
            }

            if (metadataOption && jsonSerializer) {
                try {
                    await (jsonSerializer as any).append(msg);
                } catch (err) {
                    console.warn('Error appending to metadata:', err);
                }
            }

            if (this.SIGINT) break;
        }

        // Update offset based on the last processed message
        if (mediaMessages.length > 0) {
            offset = mediaMessages[mediaMessages.length - 1].id;
        }

        this.state.set(id, {
            ...this.state.get(id),
            mediaTypes: this.state.get(id).mediaTypes.map((e: any) => {
                if (e.type === mediaType)
                    return {
                        ...e,
                        offset,
                    };
                return e;
            }),
        });

        if (this.SIGINT) {
            console.log(`Exiting, SIGINT=${this.SIGINT}`);
            await this.client.disconnect();
            await this.client.destroy();
            await this.state.commit();
            process.exit(0);
        }

        // Break if we got fewer messages than requested (reached the end)
        if (mediaMessages.length < 100) {
            console.log(`Reached end of messages for ${mediaType}`);
            this.state.set(id, {
                ...this.state.get(id),
                mediaTypes: this.state
                    .get(id)
                    .mediaTypes.filter((e: any) => e.type !== mediaType),
            });
            break;
        }
    }
}


  private async resume() {
    if (!this.client) throw new Error('TelegramClient undefined');
    const res = await inquirer.prompt<ResumeOption>({
      name: 'resume',
      type: 'list',
      message: 'Choose a chat',
      choices: [
        ...this.state
          .list()
          .map((e) => {
            const state = this.state.get(e);
            const threadInfo = state.threadId ? ` (Topic ID: ${state.threadId})` : '';
            return {
              name: `${state.displayName || e}${threadInfo}`,
              value: e
            };
          }),
        { name: 'Back', value: 'backbutton' },
      ],
    });


    if (res.resume === 'backbutton') {
      return this.main();
    }

    const entityRes = await this.client.getEntity(
      this.state.get(res.resume).entityJson.username ||
        this.state.get(res.resume).originalId
    );
    this.download(entityRes);
  }

  async main() {
    let API_ID = this.credentials.get('API_ID');
    if (!API_ID) {
      API_ID = await ask('Please provide your API_ID: ');
      this.credentials.set('API_ID', API_ID);
    }

    let API_HASH = this.credentials.get('API_HASH');
    if (!API_HASH) {
      API_HASH = await ask('Please provide your API_HASH: ', {
        type: 'password',
      });
      this.credentials.set('API_HASH', API_HASH);
    }

    if (!this.client) {
      this.client = new TelegramClient(
        new StringSession(this.credentials.get('session')),
        parseInt(API_ID),
        API_HASH,
        {}
      );
      this.client.setLogLevel(LogLevel.NONE);
    }

    if (this.client.disconnected) {
      await this.client.start({
        phoneNumber: ask.bind(undefined, 'Please enter your phone number: '),
        password: ask.bind(undefined, 'Please enter your password: ', {
          type: 'password',
        }),
        phoneCode: ask.bind(undefined, 'Please enter the code you received: ', {
          type: 'password',
        }),
        onError: (err) => console.log(err),
      });

      this.credentials.set(
        'session',
        await (this.client as any).session.save()
      );
    }

    const menu = await inquirer.prompt<MenuOption>({
      name: 'option',
      type: 'list',
      message: 'Choose an option',
      choices: [
        { name: 'Start new download', value: 'new_download' },
        { name: 'Resume active download', value: 'resume' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    switch (menu.option) {
      case 'exit':
        process.exit(0);
      case 'new_download':
        this.newDownload();
        break;
      case 'resume':
        this.resume();
        break;
    }
  }

  run() {
    this.main();

    process.on('SIGINT', () => {
      console.log('Caught interrupt signal');
      if (!this.isDownloading) process.exit(0);
      this.SIGINT = true;
    });
  }

  getStoragePath() {
    return this.storage.path;
  }
}

export default TelegramBulkDownloader;
