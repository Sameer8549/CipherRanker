/**
 * groq.js — API Helper for Groq and Mistral AI integration in the frontend.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

const JD_SYSTEM_PROMPT = `You are a senior technical recruiter. Read the job description and output ONLY a JSON object with this exact structure:

{
  "weights": {
    "career_track": 0.0,
    "skill_match": 0.0,
    "experience_years": 0.0,
    "location": 0.0,
    "education": 0.0
  },
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "ideal_experience_years": { "min": 0, "max": 0 },
  "preferred_locations": [],
  "red_flag_titles": [],
  "red_flag_skills": [],
  "career_track_keywords": [],
  "notes": ""
}

Weights must sum to 1.0. Be specific. No explanation. JSON only.`;

const EXPLAIN_SYSTEM_PROMPT = `You are a technical recruiter explaining candidate rankings to a hiring manager.
For each candidate, write exactly 2-3 sentences explaining:
1. Why they ranked where they did
2. Their strongest qualification for this role
3. One concern or gap if any exists

Be specific — mention actual years, actual skills, actual titles.
No generic statements. No two candidates should have identical explanations.
Output ONLY a JSON array of objects: [{"candidate_id": "", "explanation": ""}]`;

async function callAI(messages, apiKey, provider, jsonMode = true) {
  const isGroq = provider === "groq";
  const url = isGroq ? GROQ_URL : MISTRAL_URL;
  const model = isGroq ? "llama-3.3-70b-versatile" : "mistral-large-latest";

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  const body = {
    model: model,
    messages: messages,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Analyzes the Job Description to extract the rubric.
 */
export async function analyzeJobDescription(jdText, apiKey, provider) {
  const messages = [
    { role: "system", content: JD_SYSTEM_PROMPT },
    { role: "user", content: jdText },
  ];
  const responseText = await callAI(messages, apiKey, provider, true);
  return JSON.parse(responseText);
}

/**
 * Explains candidate rankings in batches of 10.
 */
export async function explainCandidates(candidates, rubric, apiKey, provider) {
  const messages = [
    { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Rubric:\n${JSON.stringify(rubric, null, 2)}\n\nCandidates to explain:\n${JSON.stringify(candidates, null, 2)}`,
    },
  ];
  const responseText = await callAI(messages, apiKey, provider, true);
  const data = JSON.parse(responseText);
  
  // Normalize response (either an array or an object with an explanations list)
  if (Array.isArray(data)) return data;
  if (data.explanations && Array.isArray(data.explanations)) return data.explanations;
  return [];
}

/**
 * Chat with the ranked results.
 */
export async function chatWithResults(query, resultsSummary, rubric, apiKey, provider, chatHistory = []) {
  const systemPrompt = `You are a recruitment coordinator assistant for Team Cipher. You are helping judges evaluate candidate profiles for a job description.
Here is the job description and the scoring rubric used:
${JSON.stringify(rubric, null, 2)}

Here are the ranked candidates:
${resultsSummary}

Answer the user's questions about these candidates. Be specific and base your answers strictly on the candidate data and explanations. If you don't know the answer, say so. Keep your responses concise and professional.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: query },
  ];

  return await callAI(messages, apiKey, provider, false);
}
