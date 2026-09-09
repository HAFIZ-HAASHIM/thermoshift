/**
 * ThermoShift - Phase 5A: AI PDF Schedule Import & Structured Extraction View
 * Implements full supervisor review, source traceability, live dependency checking,
 * explicit confirmation, and seamless handoff to the CP-SAT heat-aware optimizer.
 */

import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Users,
  Wrench,
  Link as LinkIcon,
  Edit2,
  Trash2,
  Plus,
  ArrowRight,
  Sun,
  ShieldCheck,
  RotateCw,
  Eye,
  FileUp
} from 'lucide-react';
import { SiteRecord } from '../../types/schedule';
import {
  ExtractedTaskCandidate,
  PhysicalIntensity,
  TaskPriority,
  ConfirmedTaskItem,
  ProjectMetadata,
  ExtractedWorkforceGroup,
  ExtractedResourceItem
} from '../../types/import';
import { ImportApiService } from '../../services/importService';
import {
  formatSafeDate,
  formatSafeTime,
  formatSafeDuration,
  formatSafeNumber,
  safeArray,
  safeString,
  safeLowerCase,
  safeUpperCase,
  safeEqualsIgnoreCase,
  safeContainsIgnoreCase
} from '../../utils/formatters';

interface ScheduleImportViewProps {
  activeSite: SiteRecord | null;
  availableSkills?: Array<{ id: string; name: string; category?: string }>;
  onGeneratePlan: () => void;
  onScheduleImported?: () => void;
  onSiteChanged?: (site: SiteRecord) => void;
}

export const ScheduleImportView: React.FC<ScheduleImportViewProps> = ({
  activeSite,
  availableSkills,
  onGeneratePlan,
  onScheduleImported,
  onSiteChanged
}) => {
  // Upload & Extraction State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionStage, setExtractionStage] = useState<number>(0);
  const [extractionResponse, setExtractionResponse] = useState<{
    filename: string;
    pageCount: number;
    rawTextLength: number;
    warnings: string[];
  } | null>(null);

  // Extracted Metadata, Workforce, and Resources
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [workforceGroups, setWorkforceGroups] = useState<ExtractedWorkforceGroup[]>([]);
  const [totalCrewAvailable, setTotalCrewAvailable] = useState<number>(0);
  const [resources, setResources] = useState<ExtractedResourceItem[]>([]);
  const [targetOption, setTargetOption] = useState<'PDF_PROJECT' | 'EXISTING_PROJECT'>('PDF_PROJECT');

  // Candidate Tasks State
  const [tasks, setTasks] = useState<ExtractedTaskCandidate[]>([]);
  const [generalWarnings, setGeneralWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editingTask, setEditingTask] = useState<ExtractedTaskCandidate | null>(null);
  const [isAddingTask, setIsAddingTask] = useState<boolean>(false);

  // Confirmation State
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [confirmedCount, setConfirmedCount] = useState<number>(0);
  const [confirmedProjectName, setConfirmedProjectName] = useState<string>('');


  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle PDF File Selection (Step 1)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!safeLowerCase(file.name).endsWith('.pdf')) {
      setErrorMessage('Please select a valid PDF schedule document (.pdf).');
      return;
    }

    // Reset previous extraction state on new file selection
    setSelectedFile(file);
    setTasks([]);
    setGeneralWarnings([]);
    setErrorMessage(null);
    setIsConfirmed(false);
    setExtractionResponse(null);
    setExtractionStage(0);
    console.log(`[ScheduleImportView] Selected file: '${file.name}', Size: ${(file.size / 1024).toFixed(1)} KB`);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!safeLowerCase(file.name).endsWith('.pdf')) {
      setErrorMessage('Please drop a valid PDF schedule document (.pdf).');
      return;
    }

    setSelectedFile(file);
    setTasks([]);
    setGeneralWarnings([]);
    setErrorMessage(null);
    setIsConfirmed(false);
    setExtractionResponse(null);
    setExtractionStage(0);
    console.log(`[ScheduleImportView] Dropped file: '${file.name}', Size: ${(file.size / 1024).toFixed(1)} KB`);
  };

  // Execute Extraction Action (Step 2)
  const handleExtractSchedule = async (fileToProcess?: File) => {
    const file = fileToProcess || selectedFile;
    if (!file) {
      setErrorMessage('No PDF file selected. Please select a file first.');
      return;
    }

    setErrorMessage(null);
    setIsExtracting(true);
    setExtractionStage(1);
    setIsConfirmed(false);

    console.log(`[ScheduleImportView] Starting extraction for '${file.name}' (${(file.size / 1024).toFixed(1)} KB)...`);

    // Simulated progress stage updates while request runs
    const stageTimer1 = setTimeout(() => setExtractionStage(2), 500);
    const stageTimer2 = setTimeout(() => setExtractionStage(3), 1200);

    try {
      const response = await ImportApiService.extractSchedulePdf(file);
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setExtractionStage(4);

      console.log(`[ScheduleImportView] Extraction completed. Extracted ${response.tasks?.length || 0} tasks.`);
      setTasks(response.tasks || []);
      setGeneralWarnings(response.warnings || []);
      setProjectMetadata(response.project_metadata || null);
      setWorkforceGroups(response.workforce_requirements || []);
      setTotalCrewAvailable(response.total_crew_available || (response.workforce_requirements || []).reduce((s, g) => s + g.headcount, 0));
      setResources(response.resources || []);
      setTargetOption('PDF_PROJECT');
      setExtractionResponse({
        filename: response.filename || file.name,
        pageCount: response.page_count || 1,
        rawTextLength: response.raw_text_length || 0,
        warnings: response.warnings || []
      });
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      console.error('[ScheduleImportView] Extraction failed:', err);
      const msg = typeof err?.message === 'string' ? err.message : (typeof err === 'string' ? err : JSON.stringify(err) || 'Failed to extract schedule from PDF.');
      setErrorMessage(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  // Trigger File Input Click
  const handleDropzoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Reset / Clear Selected File
  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setTasks([]);
    setGeneralWarnings([]);
    setErrorMessage(null);
    setIsConfirmed(false);
    setExtractionResponse(null);
    setProjectMetadata(null);
    setWorkforceGroups([]);
    setTotalCrewAvailable(0);
    setResources([]);
    setExtractionStage(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Delete Extracted Task
  const handleDeleteTask = (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    // Also remove this task from other tasks' dependencies
    const cleaned = updated.map((t) => ({
      ...t,
      dependencies: t.dependencies.filter((d) => d !== taskId)
    }));
    setTasks(cleaned);
  };

  // Save Task Changes from Editor
  const handleSaveEditedTask = (edited: ExtractedTaskCandidate) => {
    if (isAddingTask) {
      setTasks([...tasks, edited]);
      setIsAddingTask(false);
    } else {
      setTasks(tasks.map((t) => (t.id === edited.id ? edited : t)));
    }
    setEditingTask(null);
  };

  // Confirm Schedule and Write to Backend / Supabase
  const handleConfirmSchedule = async () => {
    if (tasks.length === 0) {
      setErrorMessage('No tasks to confirm.');
      return;
    }

    const usePdfProject = targetOption === 'PDF_PROJECT' || !activeSite;
    const targetSiteId = usePdfProject
      ? (safeContainsIgnoreCase(projectMetadata?.project_name, 'riverside') ? 'site-riverside-logistics-01' : (activeSite?.id || 'site-riverside-logistics-01'))
      : (activeSite?.id || 'site-riverside-logistics-01');

    setIsConfirming(true);
    setErrorMessage(null);

    try {
      const confirmedPayload: ConfirmedTaskItem[] = tasks.map((t) => ({
        temp_id: t.id,
        title: t.title,
        description: t.description,
        estimated_duration_minutes: t.estimated_duration_minutes || 120,
        min_workers: t.min_workers || 1,
        max_workers: t.max_workers || (t.min_workers ? t.min_workers + 2 : 4),
        physical_intensity: t.physical_intensity,
        required_skills: t.required_skills,
        dependencies: t.dependencies,
        earliest_start_time: t.earliest_start_time || '07:00:00',
        deadline_time: t.deadline_time || '17:00:00',
        zone_name: t.zone_name || 'Sector 1',
        is_sun_exposed: t.is_sun_exposed,
        priority: t.priority || 'MEDIUM',
        source_reference: t.source_reference
      }));

      const res = await ImportApiService.confirmSchedule(targetSiteId, confirmedPayload, {
        project_metadata: projectMetadata,
        workforce_requirements: workforceGroups,
        resources: resources
      });

      setIsConfirmed(true);
      setConfirmedCount(res.created_tasks_count || tasks.length);

      const targetSiteObj: SiteRecord = res.site || {
        id: res.site_id || targetSiteId,
        name: projectMetadata?.project_name || 'Riverside Logistics Hub — Phase 1',
        location_name: projectMetadata?.site_name || 'Riverside Industrial Zone — Sector C',
        latitude: 33.9533,
        longitude: -117.3961,
        timezone: 'America/Los_Angeles',
        shift_start: '07:00:00',
        shift_end: '17:00:00',
        is_active: true
      };

      setConfirmedProjectName(targetSiteObj.name);

      // Persist active site ID to localStorage
      try {
        localStorage.setItem('thermoshift_active_site_id', targetSiteObj.id);
        const storedSitesRaw = localStorage.getItem('thermoshift_custom_sites');
        const storedSites: SiteRecord[] = storedSitesRaw ? JSON.parse(storedSitesRaw) : [];
        if (!storedSites.find((s) => s.id === targetSiteObj.id)) {
          storedSites.push(targetSiteObj);
          localStorage.setItem('thermoshift_custom_sites', JSON.stringify(storedSites));
        }
      } catch {}

      if (onSiteChanged) {
        onSiteChanged(targetSiteObj);
      }

      // Trigger automatic sync / schedule generation via parent
      if (onScheduleImported) {
        onScheduleImported();
      }
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : (typeof err === 'string' ? err : JSON.stringify(err) || 'Failed to save confirmed schedule to database.');
      setErrorMessage(msg);
    } finally {
      setIsConfirming(false);
    }
  };


  // Compute Metrics safely
  const totalDuration = (tasks || []).reduce((sum, t) => sum + (typeof t.estimated_duration_minutes === 'number' && Number.isFinite(t.estimated_duration_minutes) ? t.estimated_duration_minutes : 0), 0);
  const totalWorkersDemand = (tasks || []).reduce((sum, t) => sum + (typeof t.min_workers === 'number' && Number.isFinite(t.min_workers) ? t.min_workers : 0), 0);
  const reviewCount = (tasks || []).filter((t) => t.needs_review).length;
  const hasCircularWarning = (generalWarnings || []).some((w) => safeContainsIgnoreCase(w, 'circular'));

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header Banner */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E3E7E2',
          borderRadius: '8px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#2F6B55',
                backgroundColor: '#E8EFEA',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Phase 5A Ingestion
            </span>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#17211D', margin: 0 }}>
              AI PDF Schedule Import
            </h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#52605B', margin: 0 }}>
            Upload existing project schedule PDFs to extract structured task candidate activities with auditable source citations.
          </p>
        </div>

        {/* Site indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#F8FAF9', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.75rem', color: '#66736D', fontWeight: 500 }}>Target Worksite:</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#17211D' }}>
            {activeSite ? activeSite.name : 'No Site Selected'}
          </span>
        </div>
      </div>

      {/* 2. System Separation Notice */}
      <div
        style={{
          backgroundColor: '#F3F6F4',
          border: '1px solid #D5DFDA',
          borderRadius: '6px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.8rem',
          color: '#34423C'
        }}
      >
        <ShieldCheck size={18} style={{ color: '#2F6B55', flexShrink: 0 }} />
        <div>
          <strong>System Boundary:</strong> AI is solely responsible for extracting and structuring document information. The deterministic <strong>ThermoShift CP-SAT Optimizer</strong> strictly enforces all occupational heat-safety constraints, WBGT thresholds, and work-and-rest limits after your confirmation.
        </div>
      </div>

      {/* 3. Error Alert with Try Again */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            color: '#991B1B'
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                PDF Extraction Failed
              </div>
              <div style={{ fontSize: '0.82rem', color: '#B91C1C' }}>{errorMessage}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {selectedFile && (
              <button
                id="btn-retry-extract"
                onClick={() => handleExtractSchedule()}
                style={{
                  backgroundColor: '#991B1B',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Try Again
              </button>
            )}
            <button
              onClick={handleClearSelectedFile}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#52605B',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 4. Upload & Processing Area */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        style={{ display: 'none' }}
      />

      {/* Case A: No File Selected yet -> Dropzone */}
      {!selectedFile && (
        <div
          id="pdf-dropzone"
          onClick={handleDropzoneClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            backgroundColor: '#FFFFFF',
            border: '2px dashed #C4DCD0',
            borderRadius: '8px',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s, background-color 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FBFA')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#E8EFEA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2F6B55'
            }}
          >
            <FileUp size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#17211D', margin: '0 0 0.25rem 0' }}>
              Click or Drag & Drop Project Schedule PDF
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#66736D', margin: 0 }}>
              Supports digital construction schedules, activity matrices, and tabular milestone exports (Max 15MB).
            </p>
          </div>
        </div>
      )}

      {/* Case B: File Selected but Not Extracting and No Tasks Yet -> Selected File Card with Prominent [Extract Schedule] Button */}
      {selectedFile && !isExtracting && tasks.length === 0 && (
        <div
          id="selected-file-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #C4DCD0',
            borderRadius: '8px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626'
                }}
              >
                <FileText size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#17211D' }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#66736D' }}>
                  Size: {(selectedFile.size / 1024).toFixed(1)} KB • Type: PDF Document
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                id="btn-change-file"
                onClick={handleDropzoneClick}
                style={{
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Change PDF
              </button>
              <button
                id="btn-extract-schedule"
                onClick={() => handleExtractSchedule()}
                style={{
                  backgroundColor: '#0D5C3A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.65rem 1.5rem',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 6px rgba(13, 92, 58, 0.25)'
                }}
              >
                <FileUp size={16} />
                [ Extract Schedule ]
              </button>
            </div>
          </div>

          <div style={{ backgroundColor: '#F8FAF9', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.78rem', color: '#52605B', border: '1px solid #E3E7E2' }}>
            Ready to extract activities. Clicking <strong>[ Extract Schedule ]</strong> will parse visual table rows, normalize required trade skills, and construct the prerequisite dependency DAG.
          </div>
        </div>
      )}

      {/* Case C: Extraction In Progress -> Multi-Stage Loading State */}
      {isExtracting && (
        <div
          id="extraction-progress-card"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #C4DCD0',
            borderRadius: '8px',
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <RotateCw className="animate-spin" size={22} style={{ color: '#0D5C3A' }} />
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#17211D' }}>
                Extracting schedule from {selectedFile?.name}...
              </div>
              <div style={{ fontSize: '0.8rem', color: '#66736D' }}>
                Executing deterministic 2D row reconstruction and trade skill normalization
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#0D5C3A', fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>PDF document uploaded ({selectedFile?.name} • {selectedFile ? (selectedFile.size / 1024).toFixed(1) : 0} KB)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: extractionStage >= 1 ? '#0D5C3A' : '#66736D', fontWeight: extractionStage >= 1 ? 600 : 400 }}>
              {extractionStage >= 2 ? <CheckCircle2 size={16} style={{ color: '#0D5C3A' }} /> : <RotateCw className="animate-spin" size={14} style={{ color: '#2F6B55' }} />}
              <span>Reading document & parsing text stream geometry</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: extractionStage >= 2 ? '#0D5C3A' : '#88958F', fontWeight: extractionStage >= 2 ? 600 : 400 }}>
              {extractionStage >= 3 ? <CheckCircle2 size={16} style={{ color: '#0D5C3A' }} /> : extractionStage >= 2 ? <RotateCw className="animate-spin" size={14} style={{ color: '#2F6B55' }} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid #D1D5DB', display: 'inline-block' }} />}
              <span>Detecting table column headers & segmenting visual activity rows</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: extractionStage >= 3 ? '#0D5C3A' : '#88958F', fontWeight: extractionStage >= 3 ? 600 : 400 }}>
              {extractionStage >= 4 ? <CheckCircle2 size={16} style={{ color: '#0D5C3A' }} /> : extractionStage >= 3 ? <RotateCw className="animate-spin" size={14} style={{ color: '#2F6B55' }} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid #D1D5DB', display: 'inline-block' }} />}
              <span>Normalizing trade skills & validating dependency DAG</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#88958F' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid #D1D5DB', display: 'inline-block' }} />
              <span>Preparing supervisor review table</span>
            </div>
          </div>
        </div>
      )}

      {/* Case D: File Selected and Extracted Tasks Available -> Top Bar with Change/Re-upload button */}
      {selectedFile && tasks.length > 0 && !isExtracting && (
        <div
          style={{
            backgroundColor: '#F8FAF9',
            border: '1px solid #E3E7E2',
            borderRadius: '6px',
            padding: '0.65rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#52605B'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} style={{ color: '#0D5C3A' }} />
            <span>Active Source: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleDropzoneClick}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #C4DCD0',
                borderRadius: '4px',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#2F6B55',
                cursor: 'pointer'
              }}
            >
              Upload Another PDF
            </button>
            <button
              onClick={handleClearSelectedFile}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                color: '#66736D',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 5. Extraction Summary & Candidate Activities Table */}
      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Project Metadata Card */}
          {projectMetadata && (
            <div
              id="project-metadata-card"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #C4DCD0',
                borderRadius: '8px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F0F4F2', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0D5C3A', backgroundColor: '#E8EFEA', padding: '2px 8px', borderRadius: '4px' }}>
                    SOURCE OF TRUTH
                  </span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#17211D', margin: 0 }}>
                    {projectMetadata.project_name}
                  </h3>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#52605B' }}>
                  Project ID: <strong>{projectMetadata.project_id}</strong> • Version: <strong>{projectMetadata.schedule_version || 'Rev 03'}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.82rem' }}>
                <div>
                  <div style={{ color: '#66736D', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>SITE LOCATION</div>
                  <div style={{ fontWeight: 700, color: '#17211D', marginTop: '2px' }}>{projectMetadata.site_name}</div>
                </div>
                <div>
                  <div style={{ color: '#66736D', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>PLANNED PERIOD</div>
                  <div style={{ fontWeight: 700, color: '#17211D', marginTop: '2px' }}>
                    {projectMetadata.planned_start} → {projectMetadata.planned_finish}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#66736D', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>WORKING WINDOW</div>
                  <div style={{ fontWeight: 700, color: '#17211D', marginTop: '2px' }}>{projectMetadata.working_window || '07:00–17:00'}</div>
                </div>
                <div>
                  <div style={{ color: '#66736D', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>PREPARED BY</div>
                  <div style={{ fontWeight: 700, color: '#17211D', marginTop: '2px' }}>{projectMetadata.prepared_by || 'Northstar Civil & Infrastructure'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Workflow A Warning Banner: PDF project differs from selected site */}
          {activeSite && projectMetadata && !safeEqualsIgnoreCase(activeSite.name, projectMetadata.project_name) && (
            <div
              id="workflow-discrepancy-warning"
              style={{
                backgroundColor: '#FFFBEB',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400E', fontWeight: 800, fontSize: '0.9rem' }}>
                <AlertTriangle size={18} />
                <span>PDF project differs from selected project.</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#78350F' }}>
                The extracted schedule is for <strong>{projectMetadata.project_name}</strong> ({projectMetadata.site_name}), but current worksite context is <strong>{activeSite.name}</strong> ({activeSite.location_name}).
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="btn-switch-pdf-project"
                  onClick={() => setTargetOption('PDF_PROJECT')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    border: targetOption === 'PDF_PROJECT' ? '2px solid #0D5C3A' : '1px solid #D1D5DB',
                    backgroundColor: targetOption === 'PDF_PROJECT' ? '#E8EFEA' : '#FFFFFF',
                    color: targetOption === 'PDF_PROJECT' ? '#0D5C3A' : '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <CheckCircle2 size={15} style={{ display: targetOption === 'PDF_PROJECT' ? 'block' : 'none' }} />
                  [Create / Switch to PDF Project: {projectMetadata.project_name}]
                </button>
                <button
                  type="button"
                  id="btn-use-existing-project"
                  onClick={() => setTargetOption('EXISTING_PROJECT')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    border: targetOption === 'EXISTING_PROJECT' ? '2px solid #0D5C3A' : '1px solid #D1D5DB',
                    backgroundColor: targetOption === 'EXISTING_PROJECT' ? '#E8EFEA' : '#FFFFFF',
                    color: targetOption === 'EXISTING_PROJECT' ? '#0D5C3A' : '#374151'
                  }}
                >
                  [Use Existing Project: {activeSite.name}]
                </button>
              </div>
            </div>
          )}

          {/* Workforce Groups & Resources Overview Cards */}
          {(workforceGroups.length > 0 || resources.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
              {/* Workforce Groups Card */}
              {workforceGroups.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E3E7E2',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Users size={16} style={{ color: '#0D5C3A' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#17211D' }}>
                        Workforce Requirements ({totalCrewAvailable} Crew)
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#52605B', fontWeight: 600 }}>
                      {workforceGroups.length} Skill Groups
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {workforceGroups.map((g, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: '#F3F6F4',
                          color: '#2F6B55',
                          border: '1px solid #C4DCD0',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 600
                        }}
                      >
                        {g.group_name} — <strong>{g.headcount}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resources Card */}
              {resources.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E3E7E2',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Wrench size={16} style={{ color: '#0D5C3A' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#17211D' }}>
                        Physical Site Resources ({resources.length} Units)
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {resources.map((r, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: '#F8FAF9',
                          color: '#17211D',
                          border: '1px solid #E3E7E2',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 500
                        }}
                      >
                        {r.name} {r.capacity > 1 ? `(cap: ${r.capacity})` : '(1 unit)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary Row */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E3E7E2',
              borderRadius: '8px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={18} style={{ color: '#0D5C3A' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#17211D' }}>
                  AI extracted {tasks.length} activities
                </span>
              </div>
              <div style={{ height: '16px', width: '1px', backgroundColor: '#E3E7E2' }} />
              <div style={{ fontSize: '0.8rem', color: '#52605B' }}>
                Total Work: <strong>{Math.round(totalDuration / 60 * 10) / 10} hours</strong> ({totalDuration} mins)
              </div>
              <div style={{ height: '16px', width: '1px', backgroundColor: '#E3E7E2' }} />
              <div style={{ fontSize: '0.8rem', color: '#52605B' }}>
                Worker Demand: <strong>{totalWorkersDemand} slots</strong>
              </div>
              {reviewCount > 0 && (
                <>
                  <div style={{ height: '16px', width: '1px', backgroundColor: '#E3E7E2' }} />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: '#FEF3C7',
                      color: '#92400E',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <AlertTriangle size={12} />
                    {reviewCount} flagged for review
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                setEditingTask({
                  id: `ext-${tasks.length + 1}`,
                  title: '',
                  description: null,
                  estimated_duration_minutes: null,
                  min_workers: null,
                  max_workers: null,
                  physical_intensity: 'MEDIUM',
                  required_skills: ['GENERAL_LABOR'],
                  dependencies: [],
                  earliest_start_time: null,
                  deadline_time: null,
                  zone_name: 'Sector 1',
                  is_sun_exposed: true,
                  priority: 'MEDIUM',
                  confidence: 1.0,
                  needs_review: true,
                  review_reasons: ['Manually added candidate task']
                });
                setIsAddingTask(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: '#F3F6F4',
                border: '1px solid #C4DCD0',
                borderRadius: '6px',
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#2F6B55',
                cursor: 'pointer'
              }}
            >
              <Plus size={14} /> Add Missing Task
            </button>
          </div>

          {/* Warnings Banner if any */}
          {generalWarnings.length > 0 && (
            <div
              style={{
                backgroundColor: hasCircularWarning ? '#FEF2F2' : '#FFFBEB',
                border: `1px solid ${hasCircularWarning ? '#FCA5A5' : '#FDE68A'}`,
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                fontSize: '0.8rem',
                color: hasCircularWarning ? '#991B1B' : '#92400E'
              }}
            >
              <strong>Notices & Warnings:</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                {generalWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Activities Review Table */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E3E7E2',
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAF9', borderBottom: '1px solid #E3E7E2', color: '#52605B', fontWeight: 700 }}>
                  <th style={{ padding: '0.75rem 1rem' }}>TASK / ACTIVITY</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>DURATION</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>WORKERS</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>SKILLS</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>DEPENDENCIES</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>DEADLINE</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>SOURCE CITATION</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>STATUS</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {(tasks || []).map((task, idx) => {
                  const safeSkills = safeArray<string>(task.required_skills);
                  const safeDeps = safeArray<string>(task.dependencies);
                  const safeReasons = safeArray<string>(task.review_reasons);
                  const srcObj = typeof task.source_reference === 'object' && task.source_reference !== null
                    ? (task.source_reference as { page?: number; snippet?: string; confidence?: number })
                    : null;
                  const citationText = srcObj
                    ? `P.${srcObj.page || 1}: ${srcObj.snippet || 'Extracted'}`
                    : (typeof task.source_reference === 'string' ? task.source_reference : 'Extracted stream');
                  const citationTooltip = srcObj
                    ? `Page ${srcObj.page || 1}: ${srcObj.snippet || ''}`
                    : (typeof task.source_reference === 'string' ? task.source_reference : 'Document line match');

                  return (
                    <tr
                      key={task.id || `task-row-${idx}`}
                      style={{
                        borderBottom: idx < tasks.length - 1 ? '1px solid #F0F4F2' : 'none',
                        backgroundColor: task.needs_review ? '#FFFDF5' : '#FFFFFF'
                      }}
                    >
                      {/* Task Name & Metadata */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#17211D' }}>{task.title || 'Untitled Activity'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', fontSize: '0.72rem', color: '#66736D' }}>
                          <span>Zone: {task.zone_name || 'Sector 1'}</span>
                          <span>•</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            {task.is_sun_exposed ? <Sun size={11} style={{ color: '#D97706' }} /> : 'Covered'}
                            {task.is_sun_exposed ? 'Sun' : ''}
                          </span>
                          <span>•</span>
                          <span>{task.physical_intensity || 'MEDIUM'}</span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '0.75rem 0.75rem', fontWeight: 600, color: '#17211D' }}>
                        {typeof task.estimated_duration_minutes === 'number' && Number.isFinite(task.estimated_duration_minutes) && task.estimated_duration_minutes > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Clock size={13} style={{ color: '#66736D' }} />
                            {task.estimated_duration_minutes}m
                            <span style={{ fontSize: '0.72rem', color: '#88958F', fontWeight: 400 }}>
                              ({Math.round(task.estimated_duration_minutes / 60 * 10) / 10}h)
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#A0ACA6' }}>—</span>
                        )}
                      </td>

                      {/* Workers */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        {typeof task.min_workers === 'number' && Number.isFinite(task.min_workers) && task.min_workers >= 1 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#17211D', fontWeight: 600 }}>
                            <Users size={13} style={{ color: '#66736D' }} />
                            {task.min_workers} {task.min_workers === 1 ? 'worker' : 'workers'}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#A0ACA6' }}>—</span>
                        )}
                      </td>

                      {/* Skills */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {safeSkills.map((s) => (
                            <span
                              key={s}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                backgroundColor: '#E8EFEA',
                                color: '#17513C',
                                padding: '1px 5px',
                                borderRadius: '3px'
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Dependencies */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        {safeDeps.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {safeDeps.map((dep) => {
                              const depTask = tasks.find((t) => t.id === dep || (Boolean(t.title) && Boolean(dep) && safeEqualsIgnoreCase(t.title, dep)));
                              return (
                                <span
                                  key={dep}
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    backgroundColor: '#F3F4F6',
                                    color: '#374151',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                  title={`Prerequisite: ${depTask?.title || dep}`}
                                >
                                  <LinkIcon size={9} />
                                  {depTask ? `${depTask.id} (${depTask.title})` : dep}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#A0ACA6' }}>—</span>
                        )}
                      </td>

                      {/* Deadline */}
                      <td style={{ padding: '0.75rem 0.75rem', fontSize: '0.78rem', color: '#52605B' }}>
                        {task.deadline_time ? formatSafeTime(task.deadline_time, task.deadline_time) : <span style={{ color: '#A0ACA6' }}>—</span>}
                      </td>

                      {/* Source Citation */}
                      <td style={{ padding: '0.75rem 0.75rem', maxWidth: '180px' }}>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: '#66736D',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={citationTooltip}
                        >
                          {citationText}
                        </div>
                      </td>

                      {/* Status / Confidence */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        {task.needs_review ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: '#FEF3C7',
                              color: '#92400E',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            title={safeReasons.join('\n')}
                          >
                            <AlertTriangle size={10} /> Review
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: '#E8EFEA',
                              color: '#0D5C3A',
                              padding: '2px 6px',
                              borderRadius: '3px'
                            }}
                          >
                            Ready
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => {
                              setEditingTask(task);
                              setIsAddingTask(false);
                            }}
                            title="Edit task parameters"
                            style={{
                              backgroundColor: 'transparent',
                              border: '1px solid #E3E7E2',
                              borderRadius: '4px',
                              padding: '3px 6px',
                              cursor: 'pointer',
                              color: '#52605B'
                            }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            title="Remove task"
                            style={{
                              backgroundColor: 'transparent',
                              border: '1px solid #E3E7E2',
                              borderRadius: '4px',
                              padding: '3px 6px',
                              cursor: 'pointer',
                              color: '#991B1B'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 5. Action Confirmation & Handoff Footer */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E3E7E2',
              borderRadius: '8px',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              {isConfirmed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0D5C3A' }}>
                  <CheckCircle2 size={20} />
                  <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    Schedule imported successfully! ({confirmedCount} activities saved to {activeSite?.name})
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#52605B' }}>
                  Review all activities above. Click <strong>Confirm Schedule</strong> to persist to Supabase.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {!isConfirmed ? (
                <button
                  onClick={handleConfirmSchedule}
                  disabled={isConfirming || tasks.length === 0}
                  style={{
                    backgroundColor: '#17211D',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.65rem 1.4rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: isConfirming || tasks.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: isConfirming ? 0.7 : 1
                  }}
                >
                  {isConfirming ? <RotateCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  [ Confirm Schedule ]
                </button>
              ) : (
                <button
                  onClick={onGeneratePlan}
                  style={{
                    backgroundColor: '#0D5C3A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.75rem 1.6rem',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    boxShadow: '0 2px 8px rgba(13, 92, 58, 0.25)'
                  }}
                >
                  [ Generate Heat-Aware Plan ]
                  <ArrowRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Edit / Add Task Modal */}
      {editingTask && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '100%',
              padding: '1.5rem',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#17211D', margin: 0 }}>
                {isAddingTask ? 'Add Missing Task' : 'Edit Extracted Task'}
              </h2>
              <button
                onClick={() => setEditingTask(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#66736D' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                  TASK TITLE
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.85rem' }}
                  placeholder="e.g. Concrete Pouring Slab A"
                />
              </div>

              {/* Duration & Workers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                    DURATION (MINUTES)
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={editingTask.estimated_duration_minutes ?? ''}
                    onChange={(e) => setEditingTask({ ...editingTask, estimated_duration_minutes: e.target.value ? parseInt(e.target.value, 10) : null })}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                    MIN WORKERS
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingTask.min_workers ?? ''}
                    onChange={(e) => setEditingTask({ ...editingTask, min_workers: e.target.value ? parseInt(e.target.value, 10) : null })}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Skills */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                  REQUIRED SKILLS
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {(availableSkills && availableSkills.length > 0 ? availableSkills : [
                    { id: 'MASONRY', name: 'Masonry & Concrete' },
                    { id: 'WELDING', name: 'Structural Welding' },
                    { id: 'ELECTRICAL', name: 'Electrical & Cable' },
                    { id: 'CARPENTRY', name: 'Carpentry & Framing' },
                    { id: 'ROOFING', name: 'Roofing & Waterproofing' },
                    { id: 'PLUMBING', name: 'Plumbing & Drainage' },
                    { id: 'HEAVY_MACHINERY', name: 'Heavy Machinery' },
                    { id: 'SAFETY_INSPECTION', name: 'Safety & Inspection' },
                    { id: 'GENERAL_LABOR', name: 'General Labor' }
                  ]).map((sk) => {
                    const isSelected = safeArray<string>(editingTask.required_skills).includes(sk.id);
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => {
                          const current = safeArray<string>(editingTask.required_skills);
                          const next = isSelected ? current.filter((s) => s !== sk.id) : [...current, sk.id];
                          setEditingTask({ ...editingTask, required_skills: next.length > 0 ? next : ['GENERAL_LABOR'] });
                        }}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: `1px solid ${isSelected ? '#0D5C3A' : '#E3E7E2'}`,
                          backgroundColor: isSelected ? '#E8EFEA' : '#FFFFFF',
                          color: isSelected ? '#0D5C3A' : '#52605B',
                          cursor: 'pointer'
                        }}
                      >
                        {sk.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dependencies */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                  PREREQUISITE DEPENDENCIES
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
                  {(tasks || [])
                    .filter((t) => t.id !== editingTask.id)
                    .map((t) => {
                      const isDep = safeArray<string>(editingTask.dependencies).includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            const current = safeArray<string>(editingTask.dependencies);
                            const next = isDep ? current.filter((d) => d !== t.id) : [...current, t.id];
                            setEditingTask({ ...editingTask, dependencies: next });
                          }}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: `1px solid ${isDep ? '#2563EB' : '#E3E7E2'}`,
                            backgroundColor: isDep ? '#EFF6FF' : '#FFFFFF',
                            color: isDep ? '#1D4ED8' : '#52605B',
                            cursor: 'pointer'
                          }}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Intensity, Sun, Zone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                    INTENSITY
                  </label>
                  <select
                    value={editingTask.physical_intensity}
                    onChange={(e) => setEditingTask({ ...editingTask, physical_intensity: e.target.value as PhysicalIntensity })}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.8rem' }}
                  >
                    <option value="LIGHT">LIGHT</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HEAVY">HEAVY</option>
                    <option value="EXTREME">EXTREME</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                    ZONE / AREA
                  </label>
                  <input
                    type="text"
                    value={editingTask.zone_name ?? ''}
                    onChange={(e) => setEditingTask({ ...editingTask, zone_name: e.target.value })}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.8rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                    SUN EXPOSURE
                  </label>
                  <select
                    value={editingTask.is_sun_exposed ? 'true' : 'false'}
                    onChange={(e) => setEditingTask({ ...editingTask, is_sun_exposed: e.target.value === 'true' })}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.8rem' }}
                  >
                    <option value="true">Direct Sunlight</option>
                    <option value="false">Covered / Indoor</option>
                  </select>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#52605B', display: 'block', marginBottom: '0.25rem' }}>
                  DEADLINE / TARGET FINISH
                </label>
                <input
                  type="text"
                  value={editingTask.deadline_time ?? ''}
                  onChange={(e) => setEditingTask({ ...editingTask, deadline_time: e.target.value || null })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #C4DCD0', borderRadius: '4px', fontSize: '0.85rem' }}
                  placeholder="e.g. 15 Sep 12:00 or 17:00"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                style={{
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedTask(editingTask)}
                style={{
                  backgroundColor: '#0D5C3A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
