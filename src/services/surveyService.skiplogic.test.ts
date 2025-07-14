import { calculateAccurateProgress } from './surveyService';
import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock SurveySession and QuestionnaireModel
jest.mock('../models/SurveySession', () => ({
  findById: jest.fn(),
}));
jest.mock('../models/Questionnaire', () => ({
  findOne: jest.fn(),
}));

const SurveySession = require('../models/SurveySession');
const QuestionnaireModel = require('../models/Questionnaire');

// Function to write test results to JSON file
const writeTestResultsToJson = (testName: string, result: any) => {
  const outputDir = path.join(__dirname, '../../test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const fileName = `${testName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
  const filePath = path.join(outputDir, fileName);
  
  const testResult = {
    test_name: testName,
    timestamp: new Date().toISOString(),
    result: result
  };
  
  fs.writeFileSync(filePath, JSON.stringify(testResult, null, 2));
  console.log(`\nTest results written to: ${filePath}`);
  
  return filePath;
};

const baseQuestions = [
  { code: 'KR001' },
  { code: 'KR002' },
  { code: 'KR003' },
  { code: 'KR004' },
  { code: 'KR005' },
  { code: 'KR006' },
  { code: 'S002' },
  { code: 'S003' },
  { code: 'S004' },
  { code: 'S005' },
  { code: 'S006' },
  { code: 'S007' },
  { code: 'S008' },
  { code: 'S009' },
  { code: 'S010' },
  { code: 'S011' },
  { code: 'S012' },
  { code: 'S013A' },
  { code: 'S013B' },
  { code: 'S013C' },
  { code: 'S013D' },
  { code: 'S013E' },
  { code: 'S013F' },
  { code: 'S014' },
  { code: 'S015' },
];

interface Response {
  question_code: string;
  valid_response: string[];
}

interface Session {
  responses: Response[];
  current_question_index: number;
  status: string;
  metrics: any;
}

const makeSession = (responses: Response[]): Session => ({
  responses,
  current_question_index: 0,
  status: 'IN_PROGRESS',
  metrics: {},
});

const makeQuestionnaire = () => ({
  survey: {
    categories: [
      { questions: baseQuestions },
    ],
  },
});

describe('Skip Logic - calculateAccurateProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    QuestionnaireModel.findOne.mockImplementation(() => ({
      sort: () => makeQuestionnaire(),
    }));
  });

  it('KR004 = Tidak Bekerja skips KR005, sets N/A, goes to KR006', async () => {
    SurveySession.findById.mockResolvedValue(makeSession([
      { question_code: 'KR001', valid_response: ['Laki-laki'] },
      { question_code: 'KR002', valid_response: ['25'] },
      { question_code: 'KR003', valid_response: ['SMA'] },
      { question_code: 'KR004', valid_response: ['Tidak Bekerja'] },
      { question_code: 'KR005', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'KR006', valid_response: ['Ya'] },
      { question_code: 'S002', valid_response: ['DKI Jakarta'] },
      { question_code: 'S003', valid_response: ['Jakarta Selatan'] },
      { question_code: 'S004', valid_response: ['Jawa Barat'] },
      { question_code: 'S005', valid_response: ['Bandung'] },
      { question_code: 'S006', valid_response: ['Januari', 'Februari'] },
      { question_code: 'S007', valid_response: ['Januari'] },
      { question_code: 'S008', valid_response: ['Tidak'] },
      { question_code: 'S009', valid_response: ['Hotel'] },
      { question_code: 'S010', valid_response: ['A'] },
      { question_code: 'S011', valid_response: ['Ya'] },
      { question_code: 'S012', valid_response: ['Ya'] },
      { question_code: 'S013A', valid_response: ['1000000'] },
      { question_code: 'S013B', valid_response: ['500000'] },
      { question_code: 'S013C', valid_response: ['300000'] },
      { question_code: 'S013D', valid_response: ['200000'] },
      { question_code: 'S013E', valid_response: ['100000'] },
      { question_code: 'S013F', valid_response: ['50000'] },
      { question_code: 'S014', valid_response: ['Ya'] },
      { question_code: 'S015', valid_response: ['A'] },
    ]));
    const result = await calculateAccurateProgress('dummy');
    
    // Write results to JSON file
    writeTestResultsToJson('KR004_Tidak_Bekerja_skips_KR005', result);
    
    console.log('\n[KR004=Tidak Bekerja] question_status:', JSON.stringify(result.question_status, null, 2));
    console.log('[KR004=Tidak Bekerja] skipped_questions_detail:', result.skipped_questions_detail);
    console.log('[KR004=Tidak Bekerja] na_questions_detail:', result.na_questions_detail);
    expect(result.na_questions_detail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionCode: 'KR005' }),
      ])
    );
    expect(result.skipped_questions_detail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionCode: 'KR005' }),
      ])
    );
    const kr005Question = result.question_status.find(q => q.question_code === 'KR005');
    const kr006Question = result.question_status.find(q => q.question_code === 'KR006');
    expect(kr005Question?.is_na).toBe(true);
    expect(kr006Question?.is_applicable).toBe(true);
  });

  it('S008 = Ya skips S009, sets N/A, goes to S010', async () => {
    SurveySession.findById.mockResolvedValue(makeSession([
      { question_code: 'KR001', valid_response: ['Perempuan'] },
      { question_code: 'KR002', valid_response: ['30'] },
      { question_code: 'KR003', valid_response: ['S1'] },
      { question_code: 'KR004', valid_response: ['Karyawan Swasta'] },
      { question_code: 'KR005', valid_response: ['Manajer'] },
      { question_code: 'KR006', valid_response: ['Tidak'] },
      { question_code: 'S002', valid_response: ['Jawa Barat'] },
      { question_code: 'S003', valid_response: ['Bandung'] },
      { question_code: 'S004', valid_response: ['DKI Jakarta'] },
      { question_code: 'S005', valid_response: ['Jakarta Pusat'] },
      { question_code: 'S006', valid_response: ['Maret', 'April'] },
      { question_code: 'S007', valid_response: ['Maret'] },
      { question_code: 'S008', valid_response: ['Ya'] },
      { question_code: 'S009', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S010', valid_response: ['A'] },
      { question_code: 'S011', valid_response: ['Tidak'] },
      { question_code: 'S012', valid_response: ['Ya'] },
      { question_code: 'S013A', valid_response: ['2000000'] },
      { question_code: 'S013B', valid_response: ['1000000'] },
      { question_code: 'S013C', valid_response: ['500000'] },
      { question_code: 'S013D', valid_response: ['300000'] },
      { question_code: 'S013E', valid_response: ['200000'] },
      { question_code: 'S013F', valid_response: ['100000'] },
      { question_code: 'S014', valid_response: ['Tidak'] },
      { question_code: 'S015', valid_response: ['B'] },
    ]));
    const result = await calculateAccurateProgress('dummy');
    
    // Write results to JSON file
    writeTestResultsToJson('S008_Ya_skips_S009', result);
    
    console.log('\n[S008=Ya] question_status:', JSON.stringify(result.question_status, null, 2));
    console.log('[S008=Ya] skipped_questions_detail:', result.skipped_questions_detail);
    console.log('[S008=Ya] na_questions_detail:', result.na_questions_detail);
    expect(result.na_questions_detail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionCode: 'S009' }),
      ])
    );
    expect(result.skipped_questions_detail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ questionCode: 'S009' }),
      ])
    );
    const s009Question = result.question_status.find(q => q.question_code === 'S009');
    const s010Question = result.question_status.find(q => q.question_code === 'S010');
    expect(s009Question?.is_na).toBe(true);
    expect(s010Question?.is_applicable).toBe(true);
  });

  it('S012 = Tidak skips S013A-S013F and S014, sets N/A, goes to S015', async () => {
    SurveySession.findById.mockResolvedValue(makeSession([
      { question_code: 'KR001', valid_response: ['Laki-laki'] },
      { question_code: 'KR002', valid_response: ['35'] },
      { question_code: 'KR003', valid_response: ['S2'] },
      { question_code: 'KR004', valid_response: ['Wiraswasta'] },
      { question_code: 'KR005', valid_response: ['Pemilik'] },
      { question_code: 'KR006', valid_response: ['Ya'] },
      { question_code: 'S002', valid_response: ['Jawa Tengah'] },
      { question_code: 'S003', valid_response: ['Semarang'] },
      { question_code: 'S004', valid_response: ['Yogyakarta'] },
      { question_code: 'S005', valid_response: ['Yogyakarta'] },
      { question_code: 'S006', valid_response: ['Mei', 'Juni'] },
      { question_code: 'S007', valid_response: ['Mei'] },
      { question_code: 'S008', valid_response: ['Tidak'] },
      { question_code: 'S009', valid_response: ['Hotel'] },
      { question_code: 'S010', valid_response: ['B'] },
      { question_code: 'S011', valid_response: ['Ya'] },
      { question_code: 'S012', valid_response: ['Tidak'] },
      { question_code: 'S013A', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S013B', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S013C', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S013D', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S013E', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S013F', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S014', valid_response: ['N/A'] }, // Auto-filled N/A
      { question_code: 'S015', valid_response: ['A'] },
    ]));
    const result = await calculateAccurateProgress('dummy');
    
    // Write results to JSON file
    writeTestResultsToJson('S012_Tidak_skips_S013A_to_S014', result);
    
    console.log('\n[S012=Tidak] question_status:', JSON.stringify(result.question_status, null, 2));
    console.log('[S012=Tidak] skipped_questions_detail:', result.skipped_questions_detail);
    console.log('[S012=Tidak] na_questions_detail:', result.na_questions_detail);
    const skipCodes = ['S013A','S013B','S013C','S013D','S013E','S013F','S014'];
    for (const code of skipCodes) {
      expect(result.na_questions_detail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ questionCode: code }),
        ])
      );
      expect(result.skipped_questions_detail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ questionCode: code }),
        ])
      );
      const question = result.question_status.find(q => q.question_code === code);
      expect(question?.is_na).toBe(true);
    }
    const s015Question = result.question_status.find(q => q.question_code === 'S015');
    expect(s015Question?.is_applicable).toBe(true);
  });

  it('No skip logic triggered, all questions applicable', async () => {
    SurveySession.findById.mockResolvedValue(makeSession([
      { question_code: 'KR001', valid_response: ['Perempuan'] },
      { question_code: 'KR002', valid_response: ['28'] },
      { question_code: 'KR003', valid_response: ['D3'] },
      { question_code: 'KR004', valid_response: ['Manajer/Pimpinan Organisasi'] },
      { question_code: 'KR005', valid_response: ['Manajer'] },
      { question_code: 'KR006', valid_response: ['Ya'] },
      { question_code: 'S002', valid_response: ['Bali'] },
      { question_code: 'S003', valid_response: ['Denpasar'] },
      { question_code: 'S004', valid_response: ['Sulawesi Selatan'] },
      { question_code: 'S005', valid_response: ['Makassar'] },
      { question_code: 'S006', valid_response: ['Juli', 'Agustus'] },
      { question_code: 'S007', valid_response: ['Juli'] },
      { question_code: 'S008', valid_response: ['Tidak'] },
      { question_code: 'S009', valid_response: ['Hotel'] },
      { question_code: 'S010', valid_response: ['A'] },
      { question_code: 'S011', valid_response: ['Ya'] },
      { question_code: 'S012', valid_response: ['Ya'] },
      { question_code: 'S013A', valid_response: ['1500000'] },
      { question_code: 'S013B', valid_response: ['750000'] },
      { question_code: 'S013C', valid_response: ['400000'] },
      { question_code: 'S013D', valid_response: ['250000'] },
      { question_code: 'S013E', valid_response: ['150000'] },
      { question_code: 'S013F', valid_response: ['75000'] },
      { question_code: 'S014', valid_response: ['Ya'] },
      { question_code: 'S015', valid_response: ['B'] },
    ]));
    const result = await calculateAccurateProgress('dummy');
    
    // Write results to JSON file
    writeTestResultsToJson('No_skip_logic_all_questions_applicable', result);
    
    console.log('\n[No skip logic] question_status:', JSON.stringify(result.question_status, null, 2));
    console.log('[No skip logic] skipped_questions_detail:', result.skipped_questions_detail);
    console.log('[No skip logic] na_questions_detail:', result.na_questions_detail);
    // No N/A or skipped questions
    expect(result.na_questions_detail.length).toBe(0);
    expect(result.skipped_questions_detail.length).toBe(0);
    // All questions should be applicable
    for (const q of baseQuestions) {
      const question = result.question_status.find(qq => qq.question_code === q.code);
      expect(question?.is_applicable).toBe(true);
    }
  });
}); 