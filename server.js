require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// --------------------
// 🔊 ElevenLabs Voice
// --------------------
async function generateVoice(text) {
  try {
    const response = await axios({
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`,
      headers: {
        "xi-api-key": process.env.ELEVEN_API_KEY,
        "Content-Type": "application/json"
      },
      data: {
        text,
        model_id: "eleven_monolingual_v1"
      },
      responseType: "arraybuffer"
    });

    const fileName = `voice-${Date.now()}.mp3`;
    const filePath = path.join(__dirname, fileName);

    fs.writeFileSync(filePath, response.data);

    return `${process.env.BASE_URL}/${fileName}`;

  } catch (err) {
    console.error("Voice Error:", err.response?.data || err.message);
    return null;
  }
}

// --------------------
// 🧠 OpenAI Response
// --------------------
async function getAIReply(userText) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a friendly AI calling assistant." },
          { role: "user", content: userText }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0].message.content;

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "Sorry, something went wrong.";
  }
}

// --------------------
// 📞 Start Call (OUTBOUND)
// --------------------
app.get("/start-call", async (req, res) => {
  const number = req.query.number;

  const url = `https://${process.env.EXOTEL_SID}:${process.env.EXOTEL_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/Calls/connect.json`;

  try {
    await axios.post(url, null, {
      params: {
        From: process.env.EXOTEL_CALLER_ID,
        To: number,
        Url: `${process.env.BASE_URL}/first-response`
      }
    });

    res.send("Call initiated");

  } catch (err) {
    console.error("Call Error:", err.response?.data || err.message);
    res.send("Call failed");
  }
});

// --------------------
// First Bot Message
// --------------------
app.post("/first-response", async (req, res) => {
  const audioUrl = await generateVoice(
    "Hello, I am your AI assistant. How can I help you?"
  );

  res.set("Content-Type", "text/xml");
  res.send(`
    <Response>
      <Play>${audioUrl}</Play>
      <Record action="${process.env.BASE_URL}/process-input" />
    </Response>
  `);
});

// --------------------
//  Conversation Loop
// --------------------
app.post("/process-input", async (req, res) => {
  try {
    const recordingUrl = req.body.RecordingUrl;

    console.log("Recording:", recordingUrl);

    // TEMP (you can add speech-to-text later)
    const userText = "User said something";

    const aiReply = await getAIReply(userText);

    const audioUrl = await generateVoice(aiReply);

    res.set("Content-Type", "text/xml");
    res.send(`
      <Response>
        <Play>${audioUrl}</Play>
        <Record action="${process.env.BASE_URL}/process-input" />
      </Response>
    `);

  } catch (err) {
    console.error(err);

    res.send(`
      <Response>
        <Say>Sorry, something went wrong</Say>
      </Response>
    `);
  }
});

// --------------------
app.get("/", (req, res) => {
  res.send("AI Calling Agent Running");
});

app.listen(process.env.PORT, () => {
  console.log("Server running...");
});