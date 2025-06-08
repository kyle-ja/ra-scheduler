import type { NextApiRequest, NextApiResponse } from 'next';

type FeedbackData = {
  name?: string;
  feedback: string;
  category: string;
  email?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('API called with method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, feedback, category, email }: FeedbackData = req.body;
    console.log('Received feedback data:', { name, category, email, feedbackLength: feedback?.length });

    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ message: 'Feedback is required' });
    }

    // Check environment variables
    console.log('EMAIL_USER exists:', !!process.env.EMAIL_USER);
    console.log('EMAIL_PASS exists:', !!process.env.EMAIL_PASS);
    console.log('EMAIL_USER value:', process.env.EMAIL_USER);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Missing email credentials');
      return res.status(500).json({ message: 'Email configuration missing' });
    }

    // Try to import nodemailer
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
      console.log('Nodemailer imported successfully');
    } catch (importError) {
      console.error('Failed to import nodemailer:', importError);
      return res.status(500).json({ message: 'Nodemailer not installed' });
    }

    // Format the email content
    const emailSubject = `RA Scheduler App - ${category}`;
    const emailBody = `
New feedback received from the RA Scheduler App:

Category: ${category}
Name: ${name || 'Anonymous'}
Email: ${email || 'Not provided'}

Feedback/Suggestion:
${feedback}

---
Sent from RA Scheduler App Feedback Form
    `.trim();

    console.log('Creating transporter...');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'kyleanthony.kja@gmail.com',
      subject: emailSubject,
      text: emailBody,
      replyTo: email || undefined,
    };

    console.log('Attempting to send email...');
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');

    res.status(200).json({ message: 'Feedback sent successfully' });
  } catch (error) {
    console.error('Detailed error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    res.status(500).json({ 
      message: 'Error sending feedback',
      error: error.message,
      code: error.code 
    });
  }
} 