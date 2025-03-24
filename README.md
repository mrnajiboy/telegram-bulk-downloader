# telegram-bulk-downloader

[![npm](https://img.shields.io/npm/v/telegram-bulk-downloader?logo=npm)](https://www.npmjs.com/package/telegram-bulk-downloader)

telegram-bulk-downloader is a command-line tool built with Node.js that allows you to download media files from a Telegram chat. It provides a convenient way to bulk download images, videos, documents, music, voice messages, and GIFs.

https://github.com/JMax45/telegram-bulk-downloader/assets/36378436/4e744c10-7e6a-4167-b528-bf63d02dcd67

## Supported Media Types:

- Photos.
- Videos.
- Documents.
- Music.
- Voice messages.
- GIFs.

## Installation

To install telegram-bulk-downloader, use npm:

```shell
npm install -g telegram-bulk-downloader
```

## Usage

### Downloading

To start downloading media files from a Telegram chat, simply run the `telegram-bulk-downloader` command in your terminal. The interface is interactive and will guide you through the process.

### Finding Chat/Topic/Message IDs:
The easiest way to find these IDs is to use the [Desktop](https://desktop.telegram.org/) or [Web](https://web.telegram.org/) app, right-click on any message, or create a new message and post, then select 'Copy Message Link' to parse the IDs from the URL. 

The URL has the following structure: t.me/c/XXXXXXXXXX/YYYY/ZZZZ.<br>
- The Chat ID is the XX.. portion of the URL with -100 prepended. (i.e. -1001234567891 or -1001987654321)
- The Topic ID is the YYYY portion of the URL.
- The Message ID is the ZZZZ portion of the URL.

### Wiping Data

If you have finished using the tool and do not plan to use it for a while, it is recommended to delete the stored data as it contains sensitive information. You can perform a data wipe using the following command:

```shell
telegram-bulk-downloader wipe
```

This command will remove all data, including authentication information.

## License

This project is licensed under the [MIT License](LICENSE).

# @mrnajiboy Additions

## Topic Filtering 
I noticed that this didn't have any ability to filter via [Topics](https://telegram.org/blog/topics-in-groups-collectible-usernames) for Larger Channels (which are basically separator threads), so I added the function and verbiage in the cli navigation. If a channel ID is detected as a forum it will automatically ask you if you'd like to filter for Topics.

## Bulk File Renaming
I also noticed files are downloaded and saved with their Telegram ID value instead of the original filenames, so I created a lightweight python script that will help you create a folder with copied files, containing the originally-named files and auto-convert .mpga files to .mp3 for convenience, so long as you have included the metadata.json file in your download.

### Prerequisites
- Python 2.x
- Metadata.json file from download

### Running the Script
To execute the script:

```shell
python rename_telegram_bulk_dl_files.py
# or
python3 rename_telegram_bulk_dl_files.py
```
Run this in your file output directory for quicker access, or enter in the file directory when prompted.
