import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

interface Result {
  scene: string;
  query: string;
  startTime?: number;
  endTime?: number;
}

const App = () => {
  const [mode, setMode] = useState<'text' | 'audio'>('text');
  const [story, setStory] = useState<string>("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  const fileToBase64 = (file: File): Promise<{ mimeType: string; data: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const mimeType = result.split(',')[0].split(':')[1].split(';')[0];
        const data = result.split(',')[1];
        resolve({ mimeType, data });
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleGenerateFromText = async () => {
     if (!story.trim()) {
      setError("Please enter a story first.");
      return;
    }
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene: {
            type: Type.STRING,
            description: "A brief description of a key scene from the story.",
          },
          query: {
            type: Type.STRING,
            description:
              "A concise and effective search query to find a relevant GIF for this scene on Google Images.",
          },
        },
        required: ["scene", "query"],
      },
    };

    const prompt = `You are an expert in visual storytelling. Read the following story and break it down into many small, granular scenes or moments suitable for a fast-paced video. The goal is to generate a large number of GIF ideas. For each tiny scene, provide a brief description and a concise search query (in English) to find a relevant GIF on Google Images.

Story:
---
${story}
---

Provide your response as a JSON array of objects, strictly following the provided schema. Generate as many scenes as possible.`;
     
     const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      
      return response.text;
  }

  const handleGenerateFromAudio = async () => {
    if (!audioFile) {
      setError("Please upload an audio file first.");
      return;
    }
    const audioSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene: {
            type: Type.STRING,
            description: "A brief description of a key scene from the audio.",
          },
          query: {
            type: Type.STRING,
            description:
              "A concise and effective search query to find a relevant GIF for this scene on Google Images.",
          },
          startTime: {
            type: Type.NUMBER,
            description: "The start time of the scene in seconds."
          },
          endTime: {
            type: Type.NUMBER,
            description: "The end time of the scene in seconds."
          }
        },
        required: ["scene", "query", "startTime", "endTime"],
      },
    };

    const prompt = `You are an expert in audio analysis and visual storytelling. Analyze the provided audio file. First, transcribe its content. Then, based on the transcription and tone, break the audio down into key scenes or moments. For each scene, provide:
1. A brief description of the scene.
2. A concise search query (in English) to find a relevant GIF on Google Images.
3. The start time of the scene in seconds (as a number).
4. The end time of the scene in seconds (as a number).

Provide your response as a JSON array of objects, strictly following the provided schema.`;

    const { mimeType, data } = await fileToBase64(audioFile);

    const audioPart = {
      inlineData: {
        mimeType,
        data,
      },
    };
    
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [textPart, audioPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: audioSchema,
      }
    });

    return response.text;
  }


  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      let jsonResponse;
      if (mode === 'text') {
        jsonResponse = await handleGenerateFromText();
      } else {
        jsonResponse = await handleGenerateFromAudio();
      }
      
      if (jsonResponse) {
        const parsedResults: Result[] = JSON.parse(jsonResponse);
        setResults(parsedResults);
      }

    } catch (err) {
      console.error(err);
      setError(
        "Failed to generate storyboard. The model might be unavailable or the input could not be processed. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };
  
  const getGoogleImageSearchUrl = (query: string) => {
    const encodedQuery = encodeURIComponent(`${query} gif`);
    return `https://www.google.com/search?q=${encodedQuery}&tbm=isch&tbs=itp:animated`;
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  const isGenerateDisabled = isLoading || (mode === 'text' && !story) || (mode === 'audio' && !audioFile);

  return (
    <div className="container">
      <header>
        <h1>GIF Storyboard Generator</h1>
        <p>Turn your stories or audio into visual scenes with AI-powered GIF suggestions.</p>
      </header>
      <main>
        <div className="mode-switcher">
          <button className={`mode-btn ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>
            Story Text
          </button>
          <button className={`mode-btn ${mode === 'audio' ? 'active' : ''}`} onClick={() => setMode('audio')}>
            Audio Analysis
          </button>
        </div>

        <div className="input-area" role="form" aria-busy={isLoading}>
          {mode === 'text' ? (
            <textarea
              className="story-textarea"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Paste your story here..."
              aria-label="Story input"
              disabled={isLoading}
            />
          ) : (
            <div className="audio-input-group">
              <label htmlFor="audio-file-input" className="audio-input-label">
                {audioFile ? "Change Audio File" : "Upload Audio"}
              </label>
              <input 
                id="audio-file-input" 
                type="file" 
                accept="audio/*" 
                onChange={(e) => setAudioFile(e.target.files ? e.target.files[0] : null)}
                disabled={isLoading}
              />
              {audioFile && <span className="file-name">{audioFile.name}</span>}
            </div>
          )}
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={isGenerateDisabled}
          >
            {isLoading ? <div className="spinner"></div> : "Generate Scenes"}
          </button>
        </div>

        {error && (
          <div className="error-message" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <section className="results-section" aria-live="polite">
            <h2>Generated Scenes</h2>
            <div className="results-grid">
              {results.map((result, index) => (
                <div key={index} className="result-card">
                  <div className="card-content">
                    {result.startTime !== undefined && result.endTime !== undefined && (
                       <p className="card-timing">{formatTime(result.startTime)} - {formatTime(result.endTime)}</p>
                    )}
                    <p><strong>Scene:</strong> {result.scene}</p>
                  </div>
                  <a
                    href={getGoogleImageSearchUrl(result.query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="find-gif-btn"
                  >
                    Find GIF
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer>
        <p>Powered by Google Gemini</p>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);