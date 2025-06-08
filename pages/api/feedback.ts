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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, feedback, category, email }: FeedbackData = req.body;

    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ message: 'Feedback is required' });
    }

    // Check environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Missing email credentials in environment variables');
      return res.status(500).json({ message: 'Email configuration missing' });
    }

    const nodemailer = require('nodemailer');

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

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Feedback sent successfully' });
  } catch (error) {
    // Only log actual errors, not debugging info
    console.error('Error sending feedback:', error);

    // Type guard for error object
    if (typeof error === 'object' && error !== null) {
      const err = error as { name?: string; message?: string; code?: string };
      res.status(500).json({ 
        message: 'Error sending feedback',
        error: err.message,
        code: err.code 
      });
    } else {
      res.status(500).json({ 
        message: 'Error sending feedback',
        error: String(error)
      });
    }
  }
} 