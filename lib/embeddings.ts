import { OpenAIApi, Configuration } from 'openai-edge'

const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(config)

export async function getEmbeddings(text: string) {
    try {
        const response = await openai.createEmbedding({
            model: 'text-embedding-ada-002',
            input: text.replace(/\n/g, " ")
        })

        const result = await response.json()
        console.log("[/lib/embedding/getEmbedding] Result: ", result)
        if (result?.error) {
            throw new Error(result.error.message)
        } else {
            return result.data[0].embedding as number[]
        }
        
    } catch (error) {
        console.log('[/lib/embedding/getEmbedding] Error: ', error)
        throw error

    }
}