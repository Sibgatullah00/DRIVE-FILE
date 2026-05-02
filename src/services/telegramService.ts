import { TelegramConfig, Folder, FileData } from '../types';

export class TelegramService {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  private async fetchApi(method: string, body: any) {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Telegram API Error');
    return data.result;
  }

  async createFolder(name: string): Promise<Folder> {
    const result = await this.fetchApi('createForumTopic', {
      chat_id: this.config.chatId,
      name: name,
    });
    return {
      id: result.message_thread_id.toString(),
      name: result.name,
      createdAt: Date.now(),
    };
  }

  async uploadFile(folderId: string, file: File, onProgress?: (p: number) => void): Promise<FileData> {
    const formData = new FormData();
    formData.append('chat_id', this.config.chatId);
    formData.append('message_thread_id', folderId);
    
    let method = 'sendDocument';
    let field = 'document';

    if (file.type.startsWith('image/')) {
      method = 'sendPhoto';
      field = 'photo';
    } else if (file.type.startsWith('video/')) {
      method = 'sendVideo';
      field = 'video';
    }

    formData.append(field, file);

    // Using XHR for progress tracking since fetch doesn't support upload progress natively in all browsers easily without complex streams
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.telegram.org/bot${this.config.botToken}/${method}`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        const response = JSON.parse(xhr.responseText);
        if (response.ok) {
          const res = response.result;
          resolve({
            messageId: res.message_id,
            fileId: res.document?.file_id || res.video?.file_id || (res.photo ? res.photo[res.photo.length - 1].file_id : undefined),
            folderId: folderId,
            name: file.name,
            size: file.size,
            type: file.type,
            date: Date.now(),
          });
        } else {
          reject(new Error(response.description));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  }

  async testConnection() {
    return this.fetchApi('getChat', { chat_id: this.config.chatId });
  }

  async getUpdates(offset: number = 0) {
     return this.fetchApi('getUpdates', { offset, limit: 100 });
  }

  async deleteFile(messageId: number) {
    return this.fetchApi('deleteMessage', { 
      chat_id: this.config.chatId,
      message_id: messageId 
    });
  }

  async getFilePath(fileId: string): Promise<string> {
    const file = await this.fetchApi('getFile', { file_id: fileId });
    return `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`;
  }
}
