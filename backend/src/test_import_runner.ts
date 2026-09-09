/**
 * ThermoShift Backend - Phase 5A Comprehensive Import Runner & Regression Suite
 */

import { PdfExtractionService } from './services/pdfExtractionService';
import { ScheduleImportService } from './services/scheduleImportService';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const filePath = path.resolve(__dirname, '../../ThermoShift_Test_Project_Schedule.pdf');
  console.log(`Reading PDF from: ${filePath}`);
  const buf = fs.readFileSync(filePath);

  console.log('1. Testing PdfExtractionService...');
  const pdfResult = await PdfExtractionService.extractPdfContent(buf, 'ThermoShift_Test_Project_Schedule.pdf');
  console.log(`- Text extracted successfully: ${pdfResult.text.length} chars, ${pdfResult.pageCount} pages`);

  console.log('2. Testing ScheduleImportService.extractScheduleFromPdf...');
  const service = new ScheduleImportService();
  const importResult = await service.extractScheduleFromPdf(pdfResult, 'ThermoShift_Test_Project_Schedule.pdf');
  console.log(`- Candidate activities detected: ${importResult.tasks.length}`);

  // Regression Assertions
  if (importResult.tasks.length !== 10) {
    throw new Error(`Expected exactly 10 candidate activities, but got ${importResult.tasks.length}`);
  }

  const expectedData: Record<string, { title: string; duration: number; workers: number; deadline: string; deps: string[]; skills: string[] }> = {
    'A-101': {
      title: 'Site clearing and debris segregation',
      duration: 120,
      workers: 3,
      deadline: '15 Sep 12:00',
      deps: [],
      skills: ['SITE_OPERATIONS']
    },
    'A-102': {
      title: 'Stormwater trench excavation',
      duration: 180,
      workers: 4,
      deadline: '16 Sep 15:00',
      deps: ['A-101'],
      skills: ['EXCAVATION']
    },
    'A-103': {
      title: 'HDPE drainage pipe installation',
      duration: 150,
      workers: 3,
      deadline: '17 Sep 15:00',
      deps: ['A-102'],
      skills: ['PIPE_INSTALLATION']
    },
    'A-104': {
      title: 'Compacted aggregate base preparation',
      duration: 210,
      workers: 4,
      deadline: '18 Sep 16:00',
      deps: ['A-101'],
      skills: ['EARTHWORKS']
    },
    'A-105': {
      title: 'Rebar cage assembly',
      duration: 180,
      workers: 3,
      deadline: '21 Sep 14:00',
      deps: ['A-104'],
      skills: ['REBAR_WORK']
    },
    'A-106': {
      title: 'Foundation concrete placement',
      duration: 240,
      workers: 5,
      deadline: '22 Sep 16:00',
      deps: ['A-105'],
      skills: ['CONCRETE_WORK']
    },
    'A-107': {
      title: 'Curing blanket installation',
      duration: 90,
      workers: 2,
      deadline: '23 Sep 12:00',
      deps: ['A-106'],
      skills: ['CONCRETE_WORK']
    },
    'A-108': {
      title: 'Perimeter lighting conduit installation',
      duration: 180,
      workers: 2,
      deadline: '24 Sep 15:00',
      deps: ['A-104'],
      skills: ['ELECTRICAL']
    },
    'A-109': {
      title: 'Safety barrier and access gate setup',
      duration: 120,
      workers: 3,
      deadline: '25 Sep 12:00',
      deps: ['A-108'],
      skills: ['SITE_OPERATIONS']
    },
    'A-110': {
      title: 'Final drainage inspection',
      duration: 90,
      workers: 2,
      deadline: '25 Sep 15:00',
      deps: ['A-103'],
      skills: ['INSPECTION']
    }
  };

  const forbiddenTitles = [
    'Activity Schedule',
    'Workforce Requirements',
    'Resource Availability',
    'Scheduling Notes',
    'Excavation',
    'Pipe Installation',
    'Foundation Pad',
    'Rebar Work',
    'Concrete Work',
    'Electrical',
    'Inspection',
    'Trained for mechanical/manual excavation activities',
    'Shaded recovery station',
    'Potable water station',
    'Portable cooling unit',
    'Plate compactor',
    'Concrete pump'
  ];

  for (const t of importResult.tasks) {
    console.log(`  * [${t.id}] ${t.title} | ${t.estimated_duration_minutes}m | ${t.min_workers} workers | Deadline: ${t.deadline_time} | Skills: ${t.required_skills.join(', ')} | Deps: ${t.dependencies.join(', ')} | Conf: ${t.confidence}`);

    for (const f of forbiddenTitles) {
      if (t.title.trim().toLowerCase() === f.toLowerCase()) {
        throw new Error(`Forbidden non-task title '${f}' was extracted as a task!`);
      }
    }

    const exp = expectedData[t.id];
    if (!exp) {
      throw new Error(`Unexpected task ID: ${t.id}`);
    }

    if (!t.title.toLowerCase().includes(exp.title.toLowerCase())) {
      throw new Error(`Task ${t.id} title mismatch: expected '${exp.title}', got '${t.title}'`);
    }

    if (t.estimated_duration_minutes !== exp.duration) {
      throw new Error(`Task ${t.id} duration mismatch: expected ${exp.duration}, got ${t.estimated_duration_minutes}`);
    }

    if (t.min_workers !== exp.workers) {
      throw new Error(`Task ${t.id} workers mismatch: expected ${exp.workers}, got ${t.min_workers}`);
    }

    if (t.deadline_time !== exp.deadline) {
      throw new Error(`Task ${t.id} deadline mismatch: expected '${exp.deadline}', got '${t.deadline_time}'`);
    }

    if (JSON.stringify(t.dependencies.sort()) !== JSON.stringify(exp.deps.sort())) {
      throw new Error(`Task ${t.id} dependencies mismatch: expected [${exp.deps.join(', ')}], got [${t.dependencies.join(', ')}]`);
    }

    if (!t.source_reference?.includes('ThermoShift_Test_Project_Schedule.pdf') || !t.source_reference?.includes(t.id)) {
      throw new Error(`Task ${t.id} source reference invalid: ${t.source_reference}`);
    }
  }

  console.log('3. Testing Candidate Validation & DAG Check...');
  const warnings: string[] = [];
  const validated = service.validateAndNormalizeCandidates(importResult.tasks, [], warnings);
  console.log(`- Validated candidate count: ${validated.length}, Warnings count: ${warnings.length}`);

  if (validated.length !== 10) {
    throw new Error(`Validated count mismatch: expected 10, got ${validated.length}`);
  }

  console.log('4. Testing Missing Value Preservation (No Fake Defaults)...');
  const dummyCandidate = {
    id: 'ext-test',
    title: 'Unspecified Task',
    estimated_duration_minutes: null,
    min_workers: null,
    required_skills: [],
    dependencies: []
  };
  const valDummy = service.validateAndNormalizeCandidates([dummyCandidate], [], []);
  if (valDummy[0].estimated_duration_minutes !== null) {
    throw new Error(`Expected missing duration to remain null, but got ${valDummy[0].estimated_duration_minutes}`);
  }
  if (valDummy[0].min_workers !== null) {
    throw new Error(`Expected missing worker count to remain null, but got ${valDummy[0].min_workers}`);
  }
  if (!valDummy[0].needs_review) {
    throw new Error('Expected needs_review to be true for missing fields');
  }

  console.log('5. Testing Rejection of Numeric Tokens & Bare IDs...');
  const invalidCandidates = [
    { id: '1', title: '0' },
    { id: '2', title: '1' },
    { id: '3', title: '2' },
    { id: '4', title: 'A-101' },
    { id: '5', title: 'Activity Schedule' },
    { id: '6', title: 'Excavation' },
    { id: '7', title: 'Concrete Work' },
    { id: '8', title: 'Valid Trenching Task', estimated_duration_minutes: 120, min_workers: 3 }
  ];
  const valFiltered = service.validateAndNormalizeCandidates(invalidCandidates as any, [], []);
  if (valFiltered.length !== 1 || valFiltered[0].title !== 'Valid Trenching Task') {
    throw new Error(`Expected only 'Valid Trenching Task' to survive, but got ${valFiltered.length} tasks: ${JSON.stringify(valFiltered)}`);
  }

  console.log('6. Testing Space-Aligned Columnar Layout B...');
  const layoutBPages = [{
    pageNumber: 1,
    text: `THERMOSHIFT MASTER SCHEDULE
SECTION 1:
Activity Schedule
--------------------------------------------------------------------------------
ID      Activity                                 Zone            Duration  Min Workers  Required Skills   Predecessor  Deadline
A-101   Site clearing and debris segregation     North Yard      120 min   3            Site Operations   -            15 Sep 12:00
A-102   Stormwater trench excavation             East Perimeter  180 min   4            Excavation        A-101        16 Sep 15:00
A-103   HDPE drainage pipe installation          East Perimeter  150 min   3            Pipe Installation A-102        17 Sep 15:00
`
  }];
  const sectionsB = PdfExtractionService.extractSections(layoutBPages);
  const tablesB = sectionsB.flatMap(s => s.tables);
  const resB = service.extractWithDeterministicParser({
    text: layoutBPages[0].text,
    pages: layoutBPages,
    pageCount: 1,
    sections: sectionsB,
    tables: tablesB,
    isScannedOrEmpty: false,
    warnings: []
  }, 'LayoutB.pdf', []);
  if (resB.length !== 3 || resB[0].id !== 'A-101' || resB[0].estimated_duration_minutes !== 120) {
    throw new Error(`Layout B extraction failed: ${JSON.stringify(resB)}`);
  }

  console.log('7. Testing Wrapped Multi-Line Layout C...');
  const layoutCPages = [{
    pageNumber: 1,
    text: `THERMOSHIFT MASTER SCHEDULE
SECTION 1:
Activity Schedule
--------------------------------------------------------------------------------
ID     | Activity                                  | Zone            | Duration | Min Workers | Required Skills  | Predecessor | Deadline
A-101  | Site clearing and                         | North Yard      | 120 min  | 3           | Site Operations  | -           | 15 Sep 12:00
       | debris segregation                        |                 |          |             |                  |             |
A-102  | Stormwater trench excavation              | East Perimeter  | 180 min  | 4           | Excavation       | A-101       | 16 Sep 15:00
`
  }];
  const sectionsC = PdfExtractionService.extractSections(layoutCPages);
  const tablesC = sectionsC.flatMap(s => s.tables);
  const resC = service.extractWithDeterministicParser({
    text: layoutCPages[0].text,
    pages: layoutCPages,
    pageCount: 1,
    sections: sectionsC,
    tables: tablesC,
    isScannedOrEmpty: false,
    warnings: []
  }, 'LayoutC.pdf', []);
  if (resC.length !== 2 || !resC[0].title.includes('debris segregation')) {
    throw new Error(`Layout C extraction failed: ${JSON.stringify(resC)}`);
  }

  console.log('\n======================================================');
  console.log('SUCCESS: ALL 16 REGRESSION TESTS PASSED IN BACKEND!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

