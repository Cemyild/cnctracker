
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy", 
});

// Define the partial schema that is relevant for analysis
const schemaDescription = `
Table "gumruk_verileri" (Customs Data / Sales):
- ay (text): Month name (ocak, subat, etc.)
- yil (integer): Year (2024, 2025, etc.)
- firma_unvan (text): Customer Name / Company Name
- top_fatura_tutar (decimal): Total Invoice Amount (Sales + VAT)
- top_kdv_tutar (decimal): Total VAT Amount
- mal_bedeli (decimal): Goods Value (Sales without VAT)
- giris_elemani (text): Employee who entered the data
- gumruk (text): Customs Office Name
- tecil_tarihi (text): Registration Date
- doviz (text): Currency (USD, EUR, etc.)

Table "giderler" (Expenses):
- ay (text): Month name
- yil (integer): Year
- firma (text): Supplier Name / Company Name
- toplam_tutar (decimal): Total Expense (with VAT)
- mal_bedeli (decimal): Expense (without VAT)
- try_tutar (decimal): Confirmed Expense Amount in TRY

Table "calisanlar" (Employees):
- ad_soyad (text): Employee Name
- net_ucret (decimal): Net Salary
- toplam_isveren_maliyeti (decimal): Total Employer Cost
- ay (text): Month
- yil (integer): Year
- sube (text): Branch
`;

export async function processUserQuery(userQuery: string): Promise<{ answer: string; sql?: string; data?: any }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      answer: "Anthropic API anahtarı bulunamadı. Lütfen .env dosyasını kontrol edin.",
    };
  }

  try {
    // Step 1: Generate SQL from Natural Language
    const systemPrompt1 = `
    You are a PostgreSQL expert. Given the following database schema, write a SQL query to answer the user's question.
    
    ${schemaDescription}
    
    Rules:
    - Respond ONLY with the raw SQL code. No markdown, no code blocks (sql), no explanations.
    - Use standard PostgreSQL syntax.
    - If the user asks for "sales" or "satış", refer to 'mal_bedeli' in 'gumruk_verileri'. Default to 'mal_bedeli' (excluding VAT) unless specified otherwise.
    - If specified as "Sales (VAT Included)", use 'top_fatura_tutar'.
    - For aggregation, sum the numeric fields.
    - For months, use Turkish names ('ocak', 'subat', etc.) in 'ay' column.
    - Provide LIMIT 5 or LIMIT 10 for lists unless specified otherwise.
    - Do NOT use ILIKE unless necessary, textual columns are usually stored exactly or need exact match.
    `;

    const message = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      system: systemPrompt1,
      messages: [
        { role: "user", content: userQuery }
      ]
    });

    let generatedSQL = (message.content[0] as any).text.trim();
    // Clean up SQL if it contains markdown
    generatedSQL = generatedSQL.replace(/```sql/g, "").replace(/```/g, "").trim();

    if (!generatedSQL.toLowerCase().startsWith("select")) {
        // If the model refused to generate SQL or chatted instead
        return { answer: generatedSQL };
    }

    return { 
        answer: "SQL Generated", // Placeholder
        sql: generatedSQL 
    };

  } catch (error: any) {
    console.error("Anthropic Error:", error);
    return { answer: "Bir hata oluştu: " + error.message };
  }
}

export async function generateNaturalLanguageResponse(userQuery: string, sql: string, resultData: any[]): Promise<string> {
   if (!process.env.ANTHROPIC_API_KEY) {
    return "API Key Error";
  }

  try {
      const systemPrompt2 = `
      You are a data analyst assistant. You are given a user question, the SQL query used to find the answer, and the raw JSON result from the database.
      
      User Question: "${userQuery}"
      SQL Query: "${sql}"
      Data: ${JSON.stringify(resultData)}
      
      Your task:
      - Answer the user's question based on the Data.
      - Be concise and professional.
      - If the data is empty, say "Veri bulunamadı."
      - Format currency in TRY (₺).
      - Respond in TURKISH.
      - If listing companies, verify they are actually Company Names and not Invoice Numbers.
      `;

      const message = await anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1024,
        system: systemPrompt2,
        messages: [{ role: "user", content: "Lütfen sonuçları analiz et." }]
      });

      return (message.content[0] as any).text || "Cevap üretilemedi.";

  } catch (error: any) {
      return "Cevap oluşturulurken hata: " + error.message;
  }
}
