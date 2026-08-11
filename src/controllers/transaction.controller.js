export class TransactionController {
  constructor(transactionService) {
    this.transactionService = transactionService;
  }

  submit = async (req, res, next) => {
    try {
      const result = await this.transactionService.submit(req.tenant.clientId, req.body, req.tenant.timezone);
      res.status(result.httpStatus).json(result.body);
    } catch (error) {
      next(error);
    }
  };

  getByTransactionId = async (req, res, next) => {
    try {
      const data = await this.transactionService.getStatus(req.tenant.clientId, req.params.transactionId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
