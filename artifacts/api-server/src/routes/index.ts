import { Router } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import portalRouter from "./portal";
import dashboardRouter from "./dashboard";
import festivalYearsRouter from "./festivalYears";
import settingsRouter from "./settings";
import vendorsRouter from "./vendors";
import sponsorsRouter from "./sponsors";
import volunteersRouter from "./volunteers";
import staffRouter from "./staff";
import exportRouter from "./exportRoutes";
import contributionsRouter from "./contributions";

const router = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(portalRouter);
router.use(dashboardRouter);
router.use(festivalYearsRouter);
router.use(settingsRouter);
router.use(vendorsRouter);
router.use(sponsorsRouter);
router.use(volunteersRouter);
router.use(staffRouter);
router.use(exportRouter);
router.use(contributionsRouter);

export default router;
