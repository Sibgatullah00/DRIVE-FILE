export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface Folder {
  id: string; // The topic_id from Telegram
  name: string;
  createdAt: number;
}

export interface FileData {
  messageId: number;
  fileId?: string; // Telegram file_id for fetching file path
  folderId: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  thumbnail?: string;
  date: number;
  isFavorite?: boolean;
}
