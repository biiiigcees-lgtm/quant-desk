import { redisGet, redisSet } from '../infra/redis';
import { createLogger } from '../infra/logger';
import { updateCalibration, getInitialCalibrationState, CalibrationState } from '../core/calibration/calibrator';

const logger = createLogger('CalibrationWorker');

export async function calibrationWorker(): Promise<void> {
  logger.info('Starting calibration worker');

  let state = await redisGet<CalibrationState>('calibration:state') || getInitialCalibrationState();

  while (true) {
    try {
      // Simulate predictions and outcomes
      const prediction = 0.5 + (Math.random() - 0.5) * 0.3;
      const actual = Math.random() > 0.5 ? 1 : 0;

      state = updateCalibration(state, prediction, actual);
      await redisSet('calibration:state', state);

      logger.info(`Calibration updated: bias=${state.bias.toFixed(4)}, score=${state.calibrationScore.toFixed(4)}`);

      await sleep(30000);
    } catch (error) {
      logger.error('Calibration error', error);
      await sleep(60000);
    }
  }
}

if (require.main === module) {
  calibrationWorker().catch(console.error);
}
