import { Router } from 'express';
import {
  getDashboardMetrics,
  getRiskByState,
  getTrends,
  getRiskDistribution,
} from '../services/dashboardService.js';

export const metricsRouter = Router();

metricsRouter.get('/dashboard', async (req, res) => {
  try {
    const data = await getDashboardMetrics();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

metricsRouter.get('/risk-by-state', async (req, res) => {
  try {
    const data = await getRiskByState();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

metricsRouter.get('/trends', async (req, res) => {
  try {
    const data = await getTrends();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

metricsRouter.get('/risk-distribution', async (req, res) => {
  try {
    const data = await getRiskDistribution();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
