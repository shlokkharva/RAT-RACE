import { loadEnv } from './utils/env.js';
import { sendJobAlertEmail } from './utils/mailer.js';

loadEnv();

async function main() {
  const sampleJob = [
    {
      id: 'test-sample-1',
      title: 'Test Alert — Junior Full-Stack / Python Developer (Fresher)',
      company: 'Rat Racer BDQ Setup Check',
      location: 'Vadodara, Gujarat',
      experience: 'Fresher (0–1 yrs)',
      salary: '',
      categories: ['fullstack', 'python', 'mern'],
      source: 'Rat Racer BDQ Test',
      applyUrl: process.env.DASHBOARD_URL || 'https://github.com',
    },
  ];

  console.log('Sending test Gmail alert using GMAIL_USER / GMAIL_APP_PASSWORD...');
  const result = await sendJobAlertEmail(sampleJob);
  if (result.sent) {
    console.log(`Success! Test email sent to ${result.recipient} (Message ID: ${result.messageId}).`);
  } else {
    console.error(`Not sent: ${result.reason}`);
    console.error('Copy .env.example to .env and fill in GMAIL_USER and GMAIL_APP_PASSWORD.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Email test failed:', err.message);
  process.exit(1);
});
