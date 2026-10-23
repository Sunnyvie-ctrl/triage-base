import "server-only";

const OPENROUTER_API_KEY = process.env.LLM_API_KEY;

export async function generateDecision(ticket: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Missing LLM_API_KEY for Decision Model.");
  }

  const payload = {
    model: "typesafe/jev-1.14",
    state: ticket,
    questions: {
      category: {
        type: "choice",
        instructions: "Which category best fits this support ticket?",
        criteria: {
          billing: "Payment, invoice, refund, and subscription charges.",
          technical_bug: "Broken software behavior or how-to questions.",
          account: "Login, password, and access problems.",
          feature_request: "Requests for new functionality."
        }
      },
      priority: {
        type: "choice",
        instructions: "What is the priority based on business impact?",
        criteria: {
          high: "Serious production disruption or major impact on users.",
          medium: "Significant issue with limited impact or a possible workaround.",
          low: "Minor issues, general questions, or low-impact requests."
        }
      }
    }
  };

  const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Decision Model API failed");
  }

  const data = await response.json();

  return {
    category: data.answers.category.choice,
    priority: data.answers.priority.choice,
    usage: {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
      thoughts_tokens: 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }
  };
}