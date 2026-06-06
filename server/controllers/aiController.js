import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import {v2 as cloudinary} from 'cloudinary'
import axios from "axios";
import fs from 'fs'
// import pdf from 'pdf-parse/lib/pdf-parse.js'
import pdf from "pdf-parse-fork";


const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generateArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." })
        }

        const response = await AI.chat.completions.create({
    model: "gemini-2.5-flash",
    messages: [
        {
            role: "user",
            content: prompt,
        },
    ],
    temperature:0.7,
    max_tokens: length,
});

const content= response.choices[0].message.content

await sql `INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'article')`;

if(plan !== 'premium'){
    await clerkClient.users.updateUserMetadata(userId,{
        privateMetadata:{
            free_usage:free_usage +1 
        }
    })
}

res.json({success:true, content})

    } catch (error) {
   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}

export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." })
        }

        const response = await AI.chat.completions.create({
    model: "gemini-2.5-flash",
    messages: [
        {
            role: "user",
            content: prompt,
        },
    ],
    temperature:0.7,
    max_tokens: 100,
});

const content= response.choices[0].message.content

await sql `INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'article')`;

if(plan !== 'premium'){
    await clerkClient.users.updateUserMetadata(userId,{
        privateMetadata:{
            free_usage:free_usage +1 
        }
    })
}

res.json({success:true, content})

    } catch (error) {
   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}

export const generateImage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, publish } = req.body;
        const plan = req.plan;

        console.log("Plan:", plan);
console.log("User:", userId);
        

        if (plan !== 'premium') {
            return res.json({ success: false, message: "Feature not available" })
        }

const formData = new FormData();
formData.append("prompt", prompt);

// const { data } = await axios.post(
//   "https://clipdrop-api.co/text-to-image/v1",
//   formData,
//   {
//     headers: {
//       ...formData.getHeaders(),
//       "x-api-key": process.env.CLIPDROP_API_KEY,
//     },
//     responseType: "arraybuffer",
//   }
// );
const response = await fetch(
  "https://clipdrop-api.co/text-to-image/v1",
  {
    method: "POST",
    headers: {
      "x-api-key": process.env.CLIPDROP_API_KEY,
    },
    body: formData,
  }
);

console.log("ClipDrop Status:", response.status);
if (!response.ok) {
  const text = await response.text();
  console.log("CLIPDROP ERROR:", text);
  throw new Error(`ClipDrop Error ${response.status}`);
}

const data = Buffer.from(await response.arrayBuffer());
console.log("Image Bytes:", data.length);

//const base64Image = `data:image/png;base64,${Buffer.from(data,'binary').toString('base64')}`;
const base64Image = `data:image/png;base64,${data.toString("base64")}`;
console.log("Uploading to Cloudinary...");
//const {secure_url} = await cloudinary.uploader.upload(base64Image)
//const result = await cloudinary.uploader.upload(base64Image);
//const secure_url = result.secure_url;
const { secure_url } =
  await cloudinary.uploader.upload(base64Image);

console.log("Cloudinary URL:", secure_url);
await sql `INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})`;



res.json({success:true, content:secure_url})

    } catch (error) {
        console.log(
  "API Key Prefix:",
  process.env.CLIPDROP_API_KEY?.substring(0, 12)
);


   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}


export const removeImageBackground = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { image } = req.file;
        const plan = req.plan;

        console.log("Plan:", plan);
        console.log("User:", userId);
        

        if (plan !== 'premium') {
            return res.json({ success: false, message: "Feature not available" })
        }



const {secure_url} = await cloudinary.uploader.upload(image.path,{
    transformation:[
        {
           effect: 'background_removal',
           background_removal: 'remove_the_background'
        }
    ]
})




await sql `INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, 'Remove background from image', ${secure_url}, 'image')`;



res.json({success:true, content:secure_url})

    } catch (error) {
   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}



export const removeImageObject = async (req, res) => {
    try {
        const { userId } = req.auth();
         const { object } = req.body;
        const { image } = req.file;
        const plan = req.plan;

        

        if (plan !== 'premium') {
            return res.json({ success: false, message: "Feature not available" })
        }



const {public_id} = await cloudinary.uploader.upload(image.path)

const imageUrl = cloudinary.url(public_id,{
    transformation:[{effect:`gen_remove:${object}`}],
    resource_type:'image'
})



await sql `INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${`Removed ${object} from image`}, ${imageUrl}, 'image')`;



res.json({success:true, content:imageUrl})

    } catch (error) {
   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}



export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;

        

        if (plan !== 'premium') {
            return res.json({ success: false, message: "Feature not available" })
        }

if(resume.size > 5 * 1024 * 1024){
    return res.json({success:false, message:"Resume file size exceeds. Allowed size (5MB)"})
}

const dataBuffer = fs.readFileSync(resume.path)
const pdfData = await pdf(dataBuffer)
const prompt = `Review the following resume and provide constructive feedback on its strengths, weaknesses, and areas for improvement. Resume Content:\n\n${pdfData.text}`


        const response = await AI.chat.completions.create({
    model: "gemini-2.5-flash",
    messages: [
        {
            role: "user",
            content: prompt,
        },
    ],
    temperature:0.7,
    max_tokens: 1000,
});

const content= response.choices[0].message.content

await sql `INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, 'Review the uploaded resume', ${content}, 'review-resume')`;

res.json({success:true, content})

    } catch (error) {
   console.log(error.message)
   res.json({success:false, message:error.message})
    }
}
