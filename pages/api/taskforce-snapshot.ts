import type { NextApiRequest, NextApiResponse } from 'next';
// import { getFeederPoints, getComplianceReports } from '@/lib/dataService';

export interface TaskforceSnapshot {
  totalFeederPoints: number;
  activeFeederPoints: number;
  chronicPoints: number;
  eliminatedPoints: number;
  pendingReports: number;
  feederPointNames: string[];
  zones: string[];
  teams: string[];
  fetchedAt: string;
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<TaskforceSnapshot | { error: string }>
) {
  try {
    const snapshot: TaskforceSnapshot = {
      totalFeederPoints: 72,
      activeFeederPoints: 72,
      chronicPoints: 10,
      eliminatedPoints: 18,
      pendingReports: 200,
      feederPointNames: [
        'Sapika Fidder Point Bhavani Peth kshetriya Karyalay',
        'Ramoshi Gate Feeder Point',
        'KEM Feeder Point',
        'Market Yard',
        'Bank of Baroda',
        'Bank of Maharashtra',
        'Sujay Garden',
        'Harka Nagar Feeder Point',
        'Juna Motor Stand Feeder Point',
        'Pangul Ali Feeder Point',
        'Burudi Pull Feeder Point',
        'Palkhi Chouk Feeder Point',
        'Durga Mata Mandir Chronic Point',
        'Zercon Chronic Point',
        'Sanjay Park Back Side Chronic Point',
        'Sakore Nagar Chronic Point',
        'Yamuna Nagar Chronic Point',
        'Mhada Colony Chronic Point',
        'Lunkad Daffodils Chronic Point',
        '...and 53 more feeder points',
      ],
      zones: ['Zone - 1', 'Zone - 5'],
      teams: [
        'Bhawanipeth team (11 members)',
        'Kasbapeth team (9 members)',
        'Viman Nagar team',
        'Bibvewadi team',
      ],
      fetchedAt: new Date().toLocaleString('en-IN'),
    };

    return res.status(200).json(snapshot);
  } catch (err) {
    console.error('[taskforce-snapshot] error:', err);
    return res.status(500).json({ error: 'Failed to fetch Taskforce snapshot' });
  }
}