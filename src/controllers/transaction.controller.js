export class TransactionController {
  constructor(transactionService) {
    this.transactionService = transactionService;
  }

  submit = async (req, res, next) => {
    try {
      const result = await this.transactionService.submit(req.tenant.clientId, req.body, req.tenant.timezone, req.tenant.enabledDirections);
      res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    }
  };

  /** `?direction=OUTWARD` — a status lookup must name the direction alongside the Transaction ID (BRD §2.1.6 "API consequence"). */
  getByTransactionId = async (req, res, next) => {
    try {
      const data = await this.transactionService.getStatus(req.tenant.clientId, req.query.direction, req.params.transactionId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /** `direction` in the body — omitted defaults to OUTWARD during the single-direction period (see TransactionService.reverseTransaction's notes; the leniency is withdrawn as an announced step, not silently). */
  reverse = async (req, res, next) => {
    try {
      const result = await this.transactionService.reverseTransaction(req.tenant.clientId, req.body?.direction, req.params.transactionId, req.body?.reason);
      res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    }
  };
}
