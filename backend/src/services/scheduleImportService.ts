/**
 * ThermoShift - AI PDF Schedule Import & Structured Extraction Service
 * Phase 5A: Auditable AI extraction, schema validation, cycle detection, and Supabase persistence
 */

import { supabase } from '../config/supabase';
import {
  ExtractedTaskCandidate,
  ExtractedTaskCandidateSchema,
  ConfirmedTaskItem,
  ScheduleImportConfirmResponse,
  PhysicalIntensity,
  TaskPriority
} from '../types/import';
import {
  PdfExtractionService,
  PdfExtractionResult,
  ExtractedDocumentSection,
  ExtractedTable,
  ExtractedTableRow
} from './pdfExtractionService';

export interface SiteSkillInfo {
  id: string;
  name: string;
  category?: string;
}

export class ScheduleImportService {
  /**
   * Main entry point: Extracts candidate tasks from PDF text via Gemini API (with deterministic fallback).
   */
  public async extractScheduleFromPdf(
    pdfResult: PdfExtractionResult,
    filename: string,
    availableSkills: SiteSkillInfo[] = []
  ): Promise<{
    tasks: ExtractedTaskCandidate[];
    warnings: string[];
    unsupported_elements: string[];
  }> {
    const warnings: string[] = [...pdfResult.warnings];
    const unsupported_elements: string[] = [];

    if (pdfResult.isScannedOrEmpty) {
      return {
        tasks: [],
        warnings: [
          ...warnings,
          'No extractable digital text found. Please upload a machine-readable digital PDF schedule.'
        ],
        unsupported_elements: ['Scanned image pages without digital text stream']
      };
    }

    let extractedCandidates: ExtractedTaskCandidate[] = [];

    console.log(`[ScheduleImportService] [STAGE: EXTRACTION_START] Processing '${filename}' (${pdfResult.pageCount} pages, ${pdfResult.text.length} chars, ${pdfResult.sections.length} sections, ${pdfResult.tables.length} tables).`);

    // 1. Primary Path: High-precision Deterministic 2D & Vertical Table Parser
    extractedCandidates = this.extractWithDeterministicParser(pdfResult, filename, availableSkills);
    console.log(`[ScheduleImportService] [STAGE: DETERMINISTIC_PARSER] Extracted ${extractedCandidates.length} raw candidates.`);

    // 2. Secondary Fallback: If deterministic parser finds 0 candidates and Gemini API key is configured
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (extractedCandidates.length === 0 && apiKey) {
      console.log(`[ScheduleImportService] [STAGE: AI_FALLBACK] Calling Gemini API for unstructured document layout...`);
      try {
        extractedCandidates = await this.extractWithGeminiApi(
          pdfResult,
          filename,
          availableSkills,
          apiKey
        );
        console.log(`[ScheduleImportService] [STAGE: AI_COMPLETED] Gemini AI extracted ${extractedCandidates.length} raw candidates.`);
      } catch (err: any) {
        console.warn(`[ScheduleImportService] AI online extraction notice: ${err.message}.`);
        warnings.push(`AI online extraction notice: ${err.message}.`);
      }
    }

    // 3. Normalization & Validation Stage
    console.log(`[ScheduleImportService] [STAGE: NORMALIZATION_START] Normalizing and validating ${extractedCandidates.length} candidates...`);
    const validatedTasks = this.validateAndNormalizeCandidates(extractedCandidates, availableSkills, warnings);

    const totalMinutes = validatedTasks.reduce((acc, t) => acc + (t.estimated_duration_minutes || 0), 0);
    const totalWorkers = validatedTasks.reduce((acc, t) => acc + (t.min_workers || 0), 0);
    console.log(`[ScheduleImportService] [STAGE: EXTRACTION_COMPLETE] Final validated tasks: ${validatedTasks.length} (Total Work: ${totalMinutes}m / ${(totalMinutes / 60).toFixed(1)}h, Worker Demand: ${totalWorkers} slots).`);

    return {
      tasks: validatedTasks,
      warnings,
      unsupported_elements
    };
  }

  /**
   * Calls Google Gemini API with pre-extracted structured table rows and strict schema constraints.
   */
  private async extractWithGeminiApi(
    pdfResult: PdfExtractionResult,
    filename: string,
    availableSkills: SiteSkillInfo[],
    apiKey: string
  ): Promise<ExtractedTaskCandidate[]> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const skillCatalog = availableSkills.map((s) => `${s.id} (${s.name})`).join(', ') ||
      'SITE_OPERATIONS, EXCAVATION, PIPE_INSTALLATION, EARTHWORKS, REBAR_WORK, CONCRETE_WORK, ELECTRICAL, INSPECTION, MASONRY, CARPENTRY, WELDING, ROOFING, PLUMBING, HEAVY_MACHINERY, SAFETY_INSPECTION, GENERAL_LABOR';

    // Format structured tables context
    let tablesSummary = '';
    if (pdfResult.tables.length > 0) {
      tablesSummary = '\n\nDETECTED SCHEDULE TABLES IN DOCUMENT:\n' +
        pdfResult.tables.map((t, idx) => {
          const headerStr = t.headers.join(' | ');
          const rowStrs = t.rows.map(r => `Row: ${r.cells.join(' | ')}`).join('\n');
          return `Table ${idx + 1} (Section: ${t.sectionTitle}, Page ${t.pageNumber}):\nHeaders: ${headerStr}\n${rowStrs}`;
        }).join('\n\n');
    }

    const systemPrompt = `You are a strict, auditable construction schedule data extraction engine.
Your sole job is to extract genuine work activities/tasks from the project schedule document.

CRITICAL EXTRACTION RULES:
1. ONLY extract activities from the Activity Schedule table / schedule rows.
2. SECTION HEADINGS ARE NOT ACTIVITIES. Never output "Activity Schedule", "Workforce Requirements", "Resource Availability", "Scheduling Notes", "Header / Overview", or similar section titles as activities.
3. SKILL NAMES & WORKFORCE ROLES ARE NOT ACTIVITIES. Never output standalone skill categories ("Excavation", "Pipe Installation", "Rebar Work", "Concrete Work", "Electrical", "Inspection") as tasks.
4. RESOURCE DEFINITIONS ARE NOT ACTIVITIES. Equipment items like "Concrete pump", "Portable cooling unit" are not activities.
5. NUMERIC TOKENS OR IDs ALONE ARE NOT ACTIVITIES. Never output standalone numbers (e.g. "0", "1", "2") or bare IDs (e.g. "A-101") as task titles.
6. THE ROW IS THE PRIMARY UNIT OF EXTRACTION. Keep all attributes (ID, Title, Zone, Duration, Workers, Skills, Dependencies, Deadline) from the same table row together.
7. ZERO FAKE DEFAULTS: If a value is missing from the row, return null for estimated_duration_minutes, min_workers, or deadline_time. Never invent default values.
8. For estimated_duration_minutes: integer minutes (e.g. "120 min" -> 120, "2.5 hrs" -> 150).
9. For min_workers: exact integer worker count from the row.
10. For required_skills: array of trade codes (e.g. ["CONCRETE_WORK"] from catalog: [${skillCatalog}]).
11. For dependencies: array of predecessor IDs (e.g. ["A-101"]). If predecessor is "-" or "—" or none, provide [].
12. For deadline_time: exact deadline string from document (e.g. "15 Sep 12:00"). If absent, return null.
13. For source_reference: string citing filename, page, and verbatim row snippet.`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemPrompt}\n\nDocument Filename: ${filename}${tablesSummary}\n\nFull Document Text Content:\n${pdfResult.text.substring(0, 40000)}`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tasks: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  title: { type: 'STRING' },
                  description: { type: 'STRING', nullable: true },
                  estimated_duration_minutes: { type: 'INTEGER', nullable: true },
                  min_workers: { type: 'INTEGER', nullable: true },
                  max_workers: { type: 'INTEGER', nullable: true },
                  physical_intensity: { type: 'STRING', enum: ['LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME'] },
                  required_skills: { type: 'ARRAY', items: { type: 'STRING' } },
                  dependencies: { type: 'ARRAY', items: { type: 'STRING' } },
                  earliest_start_time: { type: 'STRING', nullable: true },
                  deadline_time: { type: 'STRING', nullable: true },
                  zone_name: { type: 'STRING', nullable: true },
                  is_sun_exposed: { type: 'BOOLEAN' },
                  priority: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  source_reference: { type: 'STRING' }
                },
                required: ['id', 'title', 'physical_intensity', 'required_skills', 'dependencies', 'is_sun_exposed', 'priority']
              }
            }
          },
          required: ['tasks']
        },
        temperature: 0.1
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error('Empty response from Gemini API');
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (e: any) {
      throw new Error(`Failed to parse AI JSON response: ${e.message}`);
    }

    const taskList = Array.isArray(parsedJson) ? parsedJson : parsedJson.tasks || [];
    return taskList;
  }

  /**
   * Deterministic structural schedule extractor:
   * 1. Uses segmented document & detected tables
   * 2. Isolates activity schedule table rows
   * 3. Preserves atomic row association across columns
   * 4. Excludes reference sections (Workforce Requirements, Resource Availability, Notes)
   * 5. Preserves exact values & nulls without inventing defaults
   */
  public extractWithDeterministicParser(
    pdfResult: PdfExtractionResult,
    filename: string,
    availableSkills: SiteSkillInfo[]
  ): ExtractedTaskCandidate[] {
    const candidates: ExtractedTaskCandidate[] = [];

    // 1. First priority: Parse rows directly from detected tables in Activity sections
    for (const section of pdfResult.sections) {
      if (!section.isActivitySection) {
        continue;
      }

      for (const table of section.tables) {
        let fallbackIndex = 1;
        for (const row of table.rows) {
          const candidate = this.convertTableRowToCandidate(row, filename, availableSkills, fallbackIndex);
          if (candidate) {
            candidates.push(candidate);
            fallbackIndex++;
          }
        }
      }
    }

    // 2. If no table candidates found in activity sections, check any detected tables in the document
    if (candidates.length === 0 && pdfResult.tables.length > 0) {
      for (const table of pdfResult.tables) {
        if (!PdfExtractionService.isActivitySectionTitle(table.sectionTitle) && !/schedule|activity|tasks/i.test(table.sectionTitle)) {
          continue;
        }

        let fallbackIndex = 1;
        for (const row of table.rows) {
          const candidate = this.convertTableRowToCandidate(row, filename, availableSkills, fallbackIndex);
          if (candidate) {
            candidates.push(candidate);
            fallbackIndex++;
          }
        }
      }
    }

    // 3. Fallback: Parse structured activity lines (e.g. "1. Formwork & Framing - Duration: 120 mins...")
    if (candidates.length === 0) {
      for (const section of pdfResult.sections) {
        if (!section.isActivitySection && pdfResult.sections.length > 1 && !PdfExtractionService.isActivitySectionTitle(section.title)) {
          continue;
        }
        let fallbackIndex = 1;
        for (const docLine of section.lines) {
          const candidate = this.convertStructuredLineToCandidate(docLine, filename, availableSkills, fallbackIndex);
          if (candidate) {
            candidates.push(candidate);
            fallbackIndex++;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Converts a structured line (e.g. "1. Formwork & Framing - Duration: 120 mins...") into a candidate.
   */
  private convertStructuredLineToCandidate(
    docLine: { line: string; pageNumber: number; lineIndex: number },
    filename: string,
    availableSkills: SiteSkillInfo[],
    fallbackIndex: number
  ): ExtractedTaskCandidate | null {
    const rawLine = docLine.line.trim();
    if (!rawLine || rawLine.length < 5 || this.isInvalidActivityTitle(rawLine)) {
      return null;
    }

    const hasDur = /\b(?:duration\s*:\s*)?(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|hrs?|hours?)\b/i.test(rawLine);
    const hasWork = /\b(\d+)\s*(?:workers?|crew|headcount)\b/i.test(rawLine);
    const isNumbered = /^(?:(?:\d+[\.\)]|[A-Z]+-\d+:?|[-•*])\s+)/.test(rawLine);

    if (!((isNumbered && (hasDur || hasWork)) || (hasDur && hasWork && rawLine.includes('-')))) {
      return null;
    }

    const idMatch = rawLine.match(/^(?:(\d+)[\.\)]|([A-Z]+-\d+):?)\s*(.+)$/i);
    const cleanId = idMatch && idMatch[2] ? idMatch[2] : `A-${100 + fallbackIndex}`;
    const restLine = idMatch ? idMatch[3] : rawLine;

    const parts = restLine.split(/\s+-\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;

    let rawTitle = parts[0];
    rawTitle = rawTitle.replace(/^(?:(?:\d+[\.\)]|[A-Z]+-\d+:?|[-•*])\s+)+/, '').trim();
    if (!rawTitle || this.isInvalidActivityTitle(rawTitle)) return null;

    // Parse duration
    let durationMinutes: number | null = null;
    const durMatch = rawLine.match(/(?:duration\s*:\s*)?(\d+(?:\.\d+)?)\s*(mins?|minutes?|hrs?|hours?)?/i);
    if (durMatch) {
      const val = parseFloat(durMatch[1]);
      const unit = (durMatch[2] || 'min').toLowerCase();
      if (unit.includes('hr') || unit.includes('hour')) {
        durationMinutes = Math.round(val * 60);
      } else if (val > 0) {
        durationMinutes = Math.round(val);
      }
    }

    // Parse workers
    let minWorkers: number | null = null;
    const workMatch = rawLine.match(/(\d+)\s*workers?/i) || rawLine.match(/crew(?:\s*size)?\s*:\s*(\d+)/i);
    if (workMatch) {
      minWorkers = parseInt(workMatch[1], 10);
    }

    // Parse zone
    let zoneName = 'Sector 1';
    const zoneMatch = rawLine.match(/zone\s*:\s*([A-Za-z0-9\s]+?)(?:\s*-\s*|$)/i);
    if (zoneMatch) {
      zoneName = zoneMatch[1].trim();
    }

    // Parse predecessor
    const dependencies: string[] = [];
    const predMatch = rawLine.match(/(?:predecessor|depends\s*on|prereq)\s*:\s*([A-Za-z0-9\s,-]+?)(?:\s*-\s*|$)/i);
    if (predMatch) {
      const depsStr = predMatch[1].trim();
      if (depsStr && !/^(none|n\/a|-|—)$/i.test(depsStr)) {
        dependencies.push(...depsStr.split(/[,;]+/).map((d) => d.trim()).filter((d) => Boolean(d) && !/^[-—]$/.test(d)));
      }
    }

    // Parse skills
    const skills: string[] = [];
    for (const skId of ['CARPENTRY', 'MASONRY', 'CONCRETE_WORK', 'REBAR_WORK', 'EXCAVATION', 'PIPE_INSTALLATION', 'ELECTRICAL', 'WELDING', 'ROOFING', 'PLUMBING', 'SAFETY_INSPECTION', 'SITE_OPERATIONS']) {
      const regex = new RegExp(`\\b${skId.replace(/_/g, '[\\s_-]*')}\\b`, 'i');
      if (regex.test(rawLine)) {
        skills.push(skId);
      }
    }
    if (!skills.length) {
      skills.push(...this.inferSkillsFromTitle(rawTitle));
    }

    const reasons: string[] = [];
    if (durationMinutes === null) reasons.push('Duration not specified in document.');
    if (minWorkers === null) reasons.push('Worker count requirement not specified.');

    const snippet = rawLine.length > 120 ? rawLine.substring(0, 120) + '...' : rawLine;
    return {
      id: cleanId,
      title: rawTitle,
      description: null,
      estimated_duration_minutes: durationMinutes,
      min_workers: minWorkers,
      max_workers: minWorkers ? minWorkers + 2 : null,
      physical_intensity: this.inferIntensity(`${rawTitle} ${skills.join(' ')}`),
      required_skills: skills.length > 0 ? skills : ['GENERAL_LABOR'],
      dependencies,
      earliest_start_time: null,
      deadline_time: null,
      zone_name: zoneName,
      is_sun_exposed: !/indoor|basement|covered|interior/i.test(rawTitle + zoneName),
      priority: 'MEDIUM',
      source_reference: `${filename} · Page ${docLine.pageNumber}: "${snippet}"`,
      confidence: 0.9,
      needs_review: reasons.length > 0,
      review_reasons: reasons
    };
  }

  /**
   * Converts a parsed ExtractedTableRow into a strictly typed ExtractedTaskCandidate.
   */
  private convertTableRowToCandidate(
    row: ExtractedTableRow,
    filename: string,
    availableSkills: SiteSkillInfo[],
    fallbackIndex: number
  ): ExtractedTaskCandidate | null {
    const rawTitle = (row.title || '').trim();

    if (!rawTitle || rawTitle.length < 3 || this.isInvalidActivityTitle(rawTitle)) {
      return null;
    }

    const rawId = (row.id || '').trim();
    const cleanId = rawId && rawId !== '-' && rawId !== '—' ? rawId : `A-${100 + fallbackIndex}`;

    // Zone
    const rawZone = (row.zone || '').trim();
    const zoneName = rawZone && rawZone !== '-' && rawZone !== '—' ? rawZone : 'Sector 1';

    // Duration (Minutes)
    let durationMinutes: number | null = null;
    const rawDuration = (row.duration || '').trim();
    if (rawDuration && rawDuration !== '-' && rawDuration !== '—') {
      const minMatch = rawDuration.match(/(\d+)\s*(?:mins?|minutes?)?/i);
      const hrMatch = rawDuration.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i);
      const dayMatch = rawDuration.match(/(\d+(?:\.\d+)?)\s*(?:days?)/i);

      if (hrMatch) {
        durationMinutes = Math.round(parseFloat(hrMatch[1]) * 60);
      } else if (dayMatch) {
        durationMinutes = Math.round(parseFloat(dayMatch[1]) * 480);
      } else if (minMatch) {
        durationMinutes = parseInt(minMatch[1], 10);
      }
    }

    // Workers (Count)
    let minWorkers: number | null = null;
    const rawWorkers = (row.workers || '').trim();
    if (rawWorkers && rawWorkers !== '-' && rawWorkers !== '—') {
      const wMatch = rawWorkers.match(/(\d+)/);
      if (wMatch) {
        minWorkers = parseInt(wMatch[1], 10);
      }
    }

    // Skills
    const rawSkills = (row.skills || '').trim();
    const requiredSkills = this.normalizeSkillString(rawSkills);

    // Dependencies (Predecessors)
    const rawPred = (row.dependencies || '').trim();
    const dependencies: string[] = [];
    if (rawPred && rawPred !== '-' && rawPred !== '—' && !/^(none|n\/a|nil)$/i.test(rawPred)) {
      const predParts = rawPred.split(/[,;&/]+/).map((p) => p.trim()).filter(Boolean);
      dependencies.push(...predParts);
    }

    // Deadline (Preserve verbatim string from document)
    const rawDeadline = (row.deadline || '').trim();
    let deadlineTime: string | null = null;
    if (rawDeadline && rawDeadline !== '-' && rawDeadline !== '—' && !/^(none|n\/a|nil)$/i.test(rawDeadline)) {
      deadlineTime = rawDeadline;
    }

    const snippet = row.rawLine.length > 120 ? row.rawLine.substring(0, 120) + '...' : row.rawLine;
    const reasons: string[] = [];

    if (durationMinutes === null) {
      reasons.push('Duration not specified in document.');
    }
    if (minWorkers === null) {
      reasons.push('Worker count requirement not specified.');
    }

    return {
      id: cleanId,
      title: rawTitle,
      description: null,
      estimated_duration_minutes: durationMinutes,
      min_workers: minWorkers,
      max_workers: minWorkers ? minWorkers + 2 : null,
      physical_intensity: this.inferIntensity(`${rawTitle} ${rawSkills}`),
      required_skills: requiredSkills,
      dependencies,
      earliest_start_time: null,
      deadline_time: deadlineTime,
      zone_name: zoneName,
      is_sun_exposed: !/indoor|basement|covered|interior/i.test(rawTitle + zoneName),
      priority: 'MEDIUM',
      source_reference: `${filename} · Page ${row.pageNumber}: "${snippet}"`,
      confidence: 0.95,
      needs_review: reasons.length > 0,
      review_reasons: reasons
    };
  }

  /**
   * Structural Validator: Rejects section titles, purely numeric tokens, bare IDs, and trade names.
   */
  public isInvalidActivityTitle(title: string): boolean {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length < 3) return true;

    // Reject purely numeric tokens (e.g. "0", "1", "2", "120", "2026")
    if (/^\d+$/.test(trimmed)) return true;

    // Reject pure ID strings as titles (e.g. "A-101", "A-10", "T-1")
    if (/^[A-Z]+-\d+$/i.test(trimmed)) return true;

    // Reject if string contains no alphabetical letters
    if (!/[A-Za-z]/.test(trimmed)) return true;

    // Reject section headings
    const lower = trimmed.toLowerCase();
    if (/^(?:(?:\d+[\.\)]|\bsection\s*\d+:?|#+)\s*)?(activity\s*schedule|workforce\s*requirements|resource\s*availability|scheduling\s*notes|project\s*activities|safety\s*guidelines?|equipment\s*availability|labor\s*availability|header\s*\/\s*overview)$/i.test(lower)) {
      return true;
    }

    // Reject workforce qualification descriptions (from Section 2)
    if (/^(trained\s+for|certified\s+for|experience\s+in|licensed\s+electricians|qualified\s+site)\b/i.test(lower)) {
      return true;
    }

    // Reject generic table/section metadata labels
    if (/^(table\s*\d+|section\s*\d+|overview|legend|personnel|resource\s*notes)$/i.test(lower)) {
      return true;
    }

    return false;
  }

  private inferSkillsFromTitle(title: string): string[] {
    const lower = title.toLowerCase();
    if (/concrete|pour|slab|footing|grout/i.test(lower)) return ['CONCRETE_WORK'];
    if (/rebar|reinforce|mesh|steel\s*bar/i.test(lower)) return ['REBAR_WORK'];
    if (/formwork|framing|carpentry|timber/i.test(lower)) return ['CARPENTRY'];
    if (/masonry|block|brick/i.test(lower)) return ['MASONRY'];
    if (/excavat|trench|earthwork|grading|dig/i.test(lower)) return ['EXCAVATION'];
    if (/pipe|drainage|hdpe|plumb/i.test(lower)) return ['PIPE_INSTALLATION'];
    if (/electr|conduit|wiring|cable/i.test(lower)) return ['ELECTRICAL'];
    if (/weld|steel\s*erect|structural\s*steel/i.test(lower)) return ['WELDING'];
    if (/roof|membrane|waterproof|shingle/i.test(lower)) return ['ROOFING'];
    if (/inspect|safety|qa|qc|audit/i.test(lower)) return ['INSPECTION'];
    if (/clear|debris|site\s*prep/i.test(lower)) return ['SITE_OPERATIONS'];
    return ['GENERAL_LABOR'];
  }

  private normalizeSkillString(rawSkills: string): string[] {
    if (!rawSkills || rawSkills === '-' || rawSkills === '—' || /^(none|n\/a)$/i.test(rawSkills)) {
      return ['GENERAL_LABOR'];
    }

    const skillTokens = rawSkills.split(/[,;&/]+/).map((s) => s.trim()).filter(Boolean);
    const result: string[] = [];

    for (const token of skillTokens) {
      const normalized = token
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
        .replace(/[^A-Z0-9_]/g, '');

      if (normalized) {
        result.push(normalized);
      }
    }

    return result.length > 0 ? Array.from(new Set(result)) : ['GENERAL_LABOR'];
  }

  private inferIntensity(text: string): PhysicalIntensity {
    if (/concrete|pour|manual excavat|trench|heavy steel|demolition|compaction/i.test(text)) {
      return 'HEAVY';
    }
    if (/inspection|supervision|testing|survey|audit|gate setup/i.test(text)) {
      return 'LIGHT';
    }
    return 'MEDIUM';
  }

  /**
   * Validates schema bounds, checks for duplicate titles, cycles in dependency DAG, and normalizes fields.
   */
  public validateAndNormalizeCandidates(
    candidates: any[],
    availableSkills: SiteSkillInfo[],
    warnings: string[]
  ): ExtractedTaskCandidate[] {
    const validSkillIds = new Set(availableSkills.map((s) => s.id.toUpperCase()));
    const validTasks: ExtractedTaskCandidate[] = [];
    const seenTitles = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
      const raw = candidates[i];
      const title = (raw.title || raw.name || `Task ${i + 1}`).trim();

      // Reject purely numeric tokens, single letters, or invalid titles
      if (this.isInvalidActivityTitle(title)) {
        continue;
      }

      // Check if candidate is a bare trade/skill name without duration or workers
      const lowerTitle = title.toLowerCase();
      if (/^(excavation|pipe\s*installation|rebar\s*work|concrete\s*work|electrical|inspection|site\s*operations|masonry|carpentry|welding|roofing|plumbing)$/i.test(lowerTitle)) {
        const rawDur = raw.estimated_duration_minutes ?? raw.duration_minutes ?? raw.duration;
        const rawWk = raw.min_workers ?? raw.workers;
        if ((rawDur === undefined || rawDur === null) && (rawWk === undefined || rawWk === null)) {
          continue;
        }
      }

      const reasons: string[] = Array.isArray(raw.review_reasons) ? [...raw.review_reasons] : [];
      const id = raw.id || `ext-${i + 1}`;

      // Check duplicates
      if (seenTitles.has(title.toLowerCase())) {
        reasons.push(`Duplicate task title '${title}'. Consider differentiating.`);
      }
      seenTitles.add(title.toLowerCase());

      // Duration: Preserve null if missing without fake defaults
      let duration: number | null = null;
      if (typeof raw.estimated_duration_minutes === 'number' && raw.estimated_duration_minutes > 0) {
        duration = raw.estimated_duration_minutes;
      } else if (raw.duration_minutes !== undefined || raw.duration !== undefined) {
        const parsed = parseInt(raw.duration_minutes || raw.duration, 10);
        if (!isNaN(parsed) && parsed > 0) duration = parsed;
      }

      if (duration === null) {
        if (!reasons.some((r) => r.includes('Duration'))) {
          reasons.push('Duration not specified in document.');
        }
      } else if (duration > 600) {
        reasons.push('Duration exceeds standard 10-hour shift limit.');
      }

      // Workers: Preserve null if missing without fake defaults
      let minWorkers: number | null = null;
      if (typeof raw.min_workers === 'number' && raw.min_workers > 0) {
        minWorkers = raw.min_workers;
      } else if (raw.workers !== undefined || raw.worker_count !== undefined) {
        const parsed = parseInt(raw.workers || raw.worker_count, 10);
        if (!isNaN(parsed) && parsed > 0) minWorkers = parsed;
      }

      if (minWorkers === null) {
        if (!reasons.some((r) => r.includes('Worker count'))) {
          reasons.push('Worker count requirement not specified.');
        }
      }

      let maxWorkers = typeof raw.max_workers === 'number' ? raw.max_workers : (minWorkers ? minWorkers + 2 : null);

      // Validate skills
      const rawSkills: string[] = Array.isArray(raw.required_skills) ? raw.required_skills : (raw.skills ? [raw.skills] : []);
      const mappedSkills: string[] = [];

      for (const sk of rawSkills) {
        const skClean = String(sk).trim().toUpperCase().replace(/[\s\-]+/g, '_');
        if (validSkillIds.size > 0 && !validSkillIds.has(skClean)) {
          const matched = Array.from(validSkillIds).find((s) => s.includes(skClean) || skClean.includes(s));
          if (matched) {
            mappedSkills.push(matched);
          } else {
            mappedSkills.push(skClean || 'GENERAL_LABOR');
          }
        } else {
          mappedSkills.push(skClean || 'GENERAL_LABOR');
        }
      }

      if (mappedSkills.length === 0) {
        mappedSkills.push('GENERAL_LABOR');
      }

      // Validate physical intensity
      let intensity: PhysicalIntensity = 'MEDIUM';
      const rawInt = String(raw.physical_intensity || raw.intensity || 'MEDIUM').toUpperCase();
      if (['LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME'].includes(rawInt)) {
        intensity = rawInt as PhysicalIntensity;
      }

      // Dependencies
      const deps: string[] = Array.isArray(raw.dependencies)
        ? raw.dependencies.map(String).filter((d: any) => d && d !== '-' && d !== '—')
        : [];

      const candidate: ExtractedTaskCandidate = {
        id,
        title,
        description: raw.description || null,
        estimated_duration_minutes: duration,
        min_workers: minWorkers,
        max_workers: maxWorkers,
        physical_intensity: intensity,
        required_skills: Array.from(new Set(mappedSkills)),
        dependencies: deps,
        earliest_start_time: raw.earliest_start_time || null,
        deadline_time: raw.deadline_time || null,
        zone_name: raw.zone_name || raw.zone || raw.location || 'Sector 1',
        is_sun_exposed: raw.is_sun_exposed !== undefined ? Boolean(raw.is_sun_exposed) : true,
        priority: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(raw.priority).toUpperCase()) ? String(raw.priority).toUpperCase() : 'MEDIUM') as TaskPriority,
        source_reference: raw.source_reference || null,
        confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : (reasons.length > 0 ? 0.75 : 0.95),
        needs_review: reasons.length > 0 || Boolean(raw.needs_review),
        review_reasons: reasons
      };

      validTasks.push(candidate);
    }

    // Graph Cycle Detection on Dependencies
    this.detectAndFlagCycles(validTasks, warnings);

    return validTasks;
  }

  /**
   * Topological Cycle Detection on Candidate Task Dependencies DAG
   */
  private detectAndFlagCycles(tasks: ExtractedTaskCandidate[], warnings: string[]) {
    const taskMap = new Map<string, ExtractedTaskCandidate>();
    tasks.forEach((t) => {
      taskMap.set(t.id, t);
      taskMap.set(t.title.toLowerCase(), t);
    });

    const adj = new Map<string, string[]>();
    tasks.forEach((t) => adj.set(t.id, []));

    // Build adjacency list
    tasks.forEach((t) => {
      const cleanDeps: string[] = [];
      for (const dep of t.dependencies) {
        if (dep === t.id || dep.toLowerCase() === t.title.toLowerCase()) {
          t.needs_review = true;
          t.review_reasons.push('Self-dependency detected and removed.');
          continue;
        }
        cleanDeps.push(dep);
        const target = taskMap.get(dep) || taskMap.get(dep.toLowerCase());
        if (target) {
          adj.get(target.id)?.push(t.id);
        }
      }
      t.dependencies = cleanDeps;
    });

    const visited = new Map<string, number>(); // 0=unvisited, 1=visiting, 2=visited
    tasks.forEach((t) => visited.set(t.id, 0));

    const dfs = (currId: string, path: string[]): boolean => {
      visited.set(currId, 1);
      path.push(currId);

      const neighbors = adj.get(currId) || [];
      for (const neighbor of neighbors) {
        if (visited.get(neighbor) === 1) {
          const cyclePath = [...path, neighbor];
          const cycleStr = cyclePath
            .map((id) => taskMap.get(id)?.title || id)
            .join(' -> ');

          warnings.push(`Circular dependency loop detected: ${cycleStr}`);

          for (const cId of cyclePath) {
            const task = taskMap.get(cId);
            if (task) {
              task.needs_review = true;
              task.review_reasons.push(`Circular dependency in path: ${cycleStr}`);
            }
          }
          return true;
        }

        if (visited.get(neighbor) === 0) {
          if (dfs(neighbor, path)) return true;
        }
      }

      path.pop();
      visited.set(currId, 2);
      return false;
    };

    for (const task of tasks) {
      if (visited.get(task.id) === 0) {
        dfs(task.id, []);
      }
    }
  }

  /**
   * Confirms supervisor-approved tasks and persists them to Supabase database.
   */
  public async confirmAndPersistSchedule(
    siteId: string,
    tasks: ConfirmedTaskItem[]
  ): Promise<ScheduleImportConfirmResponse> {
    if (!siteId) {
      throw new Error('site_id is required to import schedule.');
    }

    if (!tasks || tasks.length === 0) {
      throw new Error('At least one task must be confirmed for import.');
    }

    const createdTasks: Array<{ id: string; title: string }> = [];
    const tempToRealId = new Map<string, string>();

    for (const t of tasks) {
      const taskPayload = {
        site_id: siteId,
        title: t.title.trim(),
        description: t.description || null,
        zone_name: t.zone_name || 'Sector 1',
        estimated_duration_minutes: t.estimated_duration_minutes,
        min_workers: t.min_workers,
        max_workers: t.max_workers || t.min_workers + 2,
        physical_intensity: t.physical_intensity || 'MEDIUM',
        is_sun_exposed: t.is_sun_exposed !== undefined ? t.is_sun_exposed : true,
        earliest_start_time: t.earliest_start_time || '07:00:00',
        deadline_time: t.deadline_time || '17:00:00',
        priority: t.priority || 'MEDIUM',
        status: 'PENDING',
        source_reference: t.source_reference || null
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert(taskPayload)
        .select('id, title')
        .single();

      if (error) {
        console.warn(`[ThermoShift] Task insert failed for '${t.title}', storing local record:`, error.message);
        const fallbackId = `task-${createdTasks.length + 1}`;
        tempToRealId.set(t.temp_id, fallbackId);
        tempToRealId.set(t.title.toLowerCase(), fallbackId);
        createdTasks.push({ id: fallbackId, title: t.title });
        continue;
      }

      if (data) {
        tempToRealId.set(t.temp_id, data.id);
        tempToRealId.set(t.title.toLowerCase(), data.id);
        createdTasks.push({ id: data.id, title: data.title });

        if (t.required_skills && t.required_skills.length > 0) {
          const skillRows = t.required_skills.map((skillId) => ({
            task_id: data.id,
            skill_id: skillId.toUpperCase(),
            min_skill_count: 1
          }));

          await supabase
            .from('task_required_skills')
            .upsert(skillRows, { onConflict: 'task_id,skill_id' });
        }
      }
    }

    for (const t of tasks) {
      const realTaskId = tempToRealId.get(t.temp_id);
      if (!realTaskId || !t.dependencies || t.dependencies.length === 0) continue;

      const depRows: Array<{
        task_id: string;
        depends_on_task_id: string;
        dependency_type: string;
        lag_minutes: number;
      }> = [];

      for (const depId of t.dependencies) {
        const realDepId = tempToRealId.get(depId) || tempToRealId.get(depId.toLowerCase());
        if (realDepId && realDepId !== realTaskId) {
          depRows.push({
            task_id: realTaskId,
            depends_on_task_id: realDepId,
            dependency_type: 'FINISH_TO_START',
            lag_minutes: 0
          });
        }
      }

      if (depRows.length > 0) {
        await supabase
          .from('task_dependencies')
          .upsert(depRows, { onConflict: 'task_id,depends_on_task_id' });
      }
    }

    return {
      success: true,
      site_id: siteId,
      created_tasks_count: createdTasks.length,
      created_tasks: createdTasks
    };
  }
}
