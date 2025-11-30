import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

// Configuration du client S3
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

export const S3_CONFIG = {
  bucket: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_REGION || 'us-east-1',
  baseUrl: process.env.AWS_S3_BASE_URL || `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`
};