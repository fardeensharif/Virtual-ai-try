
import { GoogleGenAI } from "@google/genai";
import type { Occasion, Outfit } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const getPromptForOccasion = (occasion: Occasion): string => {
  const basePrompt = "Using the provided image of a clothing item, create a complete and stylish outfit. Also, provide a single, concise styling tip (max 20 words) for wearing this outfit.";
  switch (occasion) {
    case "Casual":
      return `${basePrompt} The outfit should be casual and presented as a clean flat-lay photograph on a neutral light grey background.`;
    case "Business":
      return `${basePrompt} The outfit should be business-casual, suitable for an office, and presented as a clean flat-lay photograph on a neutral off-white background.`;
    case "Night Out":
      return `${basePrompt} The outfit should be for a night out, presented as a chic flat-lay photograph on a neutral dark charcoal background.`;
  }
};

const generateOutfitImage = async (base64Image: string, mimeType: string, occasion: Occasion): Promise<Outfit> => {
  try {
    const prompt = getPromptForOccasion(occasion);
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [imagePart, textPart] },
    });

    let imageUrl: string | null = null;
    let stylingTip: string = '';

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64ImageData = part.inlineData.data;
        imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageData}`;
      } else if (part.text) {
        stylingTip = part.text.trim();
      }
    }
    
    if (!imageUrl) {
        throw new Error(`No image generated for ${occasion}`);
    }

    return {
        title: occasion,
        imageUrl,
        stylingTip,
    };

  } catch (error) {
    console.error(`Error generating ${occasion} outfit:`, error);
    throw new Error(`Failed to generate the ${occasion} outfit. The model may not have been able to process the request.`);
  }
};

export const generateAllOutfits = async (base64Image: string, mimeType: string): Promise<Outfit[]> => {
  const occasions: Occasion[] = ["Casual", "Business", "Night Out"];
  
  const promises = occasions.map(occasion => 
    generateOutfitImage(base64Image, mimeType, occasion)
  );

  return Promise.all(promises);
};