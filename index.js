require("dotenv").config();

const express = require("express");
const Groq = require("groq-sdk");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is missing from .env");
    process.exit(1);
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const MODELS = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3-32b"
];

const DEFAULT_MODEL =
    process.env.GROQ_MODEL || MODELS[0];

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        name: "DARK GPT",
        version: "1.0.0"
    });
});

app.get("/api/models", (req, res) => {
    res.json({
        models: MODELS,
        default: DEFAULT_MODEL
    });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
    try {
        const { messages, model } = req.body;

        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: "Please provide a message."
            });
        }

        if (messages.length > 30) {
            return res.status(400).json({
                error: "Maximum 30 messages per request."
            });
        }

        const selectedModel = MODELS.includes(model)
            ? model
            : DEFAULT_MODEL;

        const validMessages = messages.map(message => {
            if (
                !message ||
                !["user", "assistant"].includes(message.role) ||
                typeof message.content !== "string" ||
                message.content.length > 12000
            ) {
                throw new Error("Invalid message format.");
            }

            return {
                role: message.role,
                content: message.content
            };
        });

        const completion = await groq.chat.completions.create({
            model: selectedModel,
            messages: [
                {
                    role: "system",
                    content: `You are DARK GPT, an intelligent AI assistant created by SIMON TECH INC.

Your personality:
- Helpful, intelligent and friendly.
- Explain complex topics clearly.
- Help with programming, education, writing and research.
- Provide accurate and honest answers.
- Admit when you don't know something.
- Format code using Markdown code blocks.
- Never claim to have performed actions you haven't performed.
- Follow appropriate safety guidelines.`
                },
                ...validMessages
            ],
            temperature: 0.7,
            max_completion_tokens: 4096
        });

        const answer =
            completion.choices?.[0]?.message?.content;

        if (!answer) {
            throw new Error("The AI returned an empty response.");
        }

        res.json({
            success: true,
            answer,
            model: selectedModel
        });

    } catch (error) {
        console.error("DARK GPT ERROR:", error.message);

        res.status(500).json({
            success: false,
            error: error.status === 429
                ? "Groq rate limit reached. Please try again later."
                : "Unable to generate a response. Please try again."
        });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`
╭──────────────────────────────╮
│       DARK GPT V1.0           │
│       SIMON TECH INC          │
├──────────────────────────────┤
│ Status: ONLINE                │
│ Port: ${PORT}                     │
│ Provider: GROQ API            │
╰──────────────────────────────╯
    `);
});
