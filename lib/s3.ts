import AWS from 'aws-sdk'

export async function uploadToS3(file: File) {
    try {

    } catch (error) {
        AWS.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        })
    }
}