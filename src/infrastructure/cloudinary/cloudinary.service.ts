import { Injectable, OnModuleInit } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  onModuleInit() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadBuffer(buffer: Buffer, folder: string, publicId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options: any = { folder, resource_type: 'image' };
      if (publicId) options.public_id = publicId;
      cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        resolve(result.secure_url);
      }).end(buffer);
    });
  }

  async deleteByUrl(url: string): Promise<void> {
    const match = url.match(/\/([^/]+)\.[a-z]+$/i);
    if (!match) return;
    const folder = url.includes('/vouchers/') ? 'vouchers' : 'products';
    await cloudinary.uploader.destroy(`${folder}/${match[1]}`).catch(() => {});
  }
}
