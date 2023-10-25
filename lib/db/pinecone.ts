import { PineconeClient, Vector, utils as PineconeUtils } from '@pinecone-database/pinecone'
import { downloadFromS3 } from '../s3-server'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { Document, RecursiveCharacterTextSplitter } from '@pinecone-database/doc-splitter'
import { TextDecoder, TextEncoder } from 'util'
import { getEmbeddings } from '../embeddings'
import md5 from 'md5'
import { convertToAscii } from '../utils'

let pinecone: PineconeClient | null = null

export const getPineconeClient = async () => {
    if (!pinecone) {
        pinecone = new PineconeClient()
        await pinecone.init({
            environment: process.env.PINECONE_ENVIRONMENT!,
            apiKey: process.env.PINECONE_API_KEY!,
        })
    }
    return pinecone
}

type PDFPage = {
    pageContent: string
    metadata: {
        loc: { pageNumber: number }
    }
}

export async function loadS3IntoPinecone(fileKey: string) {
    // 1. Obtain the pdf, download and read from pdf
    console.log('[/lib/db/pinecone/loadS3IntoPinecone] Downloading s3 into file system')
    const file_name = await downloadFromS3(fileKey)

    if (!file_name) {
        console.log('[/lib/db/pinecone/loadS3IntoPinecone] Error: Could not download from s3')
        throw new Error('Could not download from s3')
    }

    const loader = new PDFLoader(file_name)
    const pages = (await loader.load()) as PDFPage[] // load all pages within pdf
    console.log('[/lib/db/pinecone/loadS3IntoPinecone] Success load all pages within pdf:' + pages.length)
    // 2. split and segment the pdf
    const documents = await Promise.all(pages.map(prepareDocument))
    console.log('[/lib/db/pinecone/loadS3IntoPinecone] Success split and segment the pdf pages into documents: ' + documents.length)

    // 3. vectorize and embed individual documents
    const vectors = await Promise.all(documents.flat().map(embedDocument))
    console.log('[/lib/db/pinecone/loadS3IntoPinecone] Success vectorize and embed individual documents.')

    // 4 . upload to pincecone
    const client = await getPineconeClient()
    const pincodeIndex = client.Index('my-chatpdf')
    
    const namespace = convertToAscii(fileKey)
    console.log(`[/lib/db/pinecone/loadS3IntoPinecone] Inserting vectors into pinecone, namespace:${namespace}.`)
    PineconeUtils.chunkedUpsert(pincodeIndex, vectors, "", 10)
    return documents[0]

}

async function embedDocument(doc: Document) {
    try {
        const embeddings = await getEmbeddings(doc.pageContent)

        const hash = md5(doc.pageContent)
        console.log('[/lib/db/pinecone/embedDocument] Success embed document with hash ', hash)

        return {
            id: hash,
            values: embeddings,
            metadata: {
                text: doc.metadata.text,
                pageNumber: doc.metadata.pageNumber
            }
        } as Vector

    } catch (error) {
        console.log('[/lib/db/pinecone/embedDocument] Error: ', error)
        throw error
    }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
    const enc = new TextEncoder()
    return new TextDecoder('utf-8').decode(enc.encode(str).slice(0, bytes))


}

async function prepareDocument(page: PDFPage) {
    let { pageContent, metadata } = page;
    pageContent = pageContent.replace(/\n/g, '') // replace newline with empty string

    // split a page into small chunk
    const splitter = new RecursiveCharacterTextSplitter()
    const docs = await splitter.splitDocuments([
        new Document({
            pageContent, 
            metadata: {
                pageNumber: metadata.loc.pageNumber,
                text: truncateStringByBytes(pageContent, 36000)
            }
        })
    ])

    console.log(`[lib/db/pinecone/prepareDocument] Success split page into ${docs.length} documents.`)
    return docs
}