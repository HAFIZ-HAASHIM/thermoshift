import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

async function testPort(port: number) {
  const filePath = path.resolve(__dirname, '../../ThermoShift_Test_Project_Schedule.pdf');
  const fileData = fs.readFileSync(filePath);

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ThermoShift_Test_Project_Schedule.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const fullPayload = Buffer.concat([
    Buffer.from(header, 'utf8'),
    fileData,
    Buffer.from(footer, 'utf8')
  ]);

  return new Promise<void>((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/schedules/import/extract',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullPayload.length
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`\n=== LIVE HTTP TEST ON PORT ${port} (Status ${res.statusCode}) ===`);
          try {
            const parsed = JSON.parse(data);
            console.log(`Success: ${parsed.success}, Extracted count: ${parsed.tasks?.length}`);
            if (parsed.tasks) {
              parsed.tasks.forEach((t: any) => {
                console.log(
                  `  * [${t.id}] ${t.title} | ${t.estimated_duration_minutes}m | ${t.min_workers} workers | Deadline: ${t.deadline_time} | Skills: ${t.required_skills?.join(', ')} | Deps: ${t.dependencies?.join(', ')}`
                );
              });
            }
            if (parsed.tasks?.length !== 10) {
              console.error(`ERROR: Expected 10 tasks on port ${port}, got ${parsed.tasks?.length}`);
            }
          } catch (err: any) {
            console.error('Failed to parse response JSON:', err.message, data.substring(0, 200));
          }
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      console.error(`Connection error on port ${port}:`, err.message);
      resolve();
    });

    req.write(fullPayload);
    req.end();
  });
}

async function run() {
  await testPort(5000);
  await testPort(8000);
}

run();
