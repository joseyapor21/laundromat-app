import { mdToPdf } from 'md-to-pdf';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function generatePDF() {
  console.log('Generating Employee Training Guide PDF...\n');

  const inputPath = join(projectRoot, 'docs', 'Employee-Training-Guide.md');
  const outputPath = join(projectRoot, 'docs', 'Employee-Training-Guide.pdf');
  const cssPath = join(projectRoot, 'docs', 'training-guide.css');

  try {
    const pdf = await mdToPdf(
      { path: inputPath },
      {
        dest: outputPath,
        pdf_options: {
          format: 'Letter',
          margin: {
            top: '1in',
            bottom: '1in',
            left: '0.75in',
            right: '0.75in',
          },
          printBackground: true,
        },
        stylesheet: cssPath,
      }
    );

    if (pdf) {
      console.log('✅ PDF generated successfully!');
      console.log(`📄 Output: ${outputPath}\n`);
    }
  } catch (error) {
    console.error('❌ Error generating PDF:', error.message);
    process.exit(1);
  }
}

generatePDF();
