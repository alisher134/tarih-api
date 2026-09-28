import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TelegramUpdateService } from "./telegram-update.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {},
}));

describe("TelegramWebhookController", () => {
  const updateService = {
    handleUpdate: jest.fn(),
  };

  async function createController(webhookSecret: string) {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramWebhookController],
      providers: [
        {
          provide: TelegramUpdateService,
          useValue: updateService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(webhookSecret),
          },
        },
      ],
    }).compile();

    return module.get(TelegramWebhookController);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects webhook when secret is not configured", async () => {
    const controller = await createController("");

    await expect(
      controller.handleWebhook("test-webhook-secret", { update_id: 1 }),
    ).rejects.toThrow(UnauthorizedException);
    expect(updateService.handleUpdate).not.toHaveBeenCalled();
  });

  it("rejects webhook with invalid secret token", async () => {
    const controller = await createController("configured-secret");

    await expect(
      controller.handleWebhook("wrong-secret", { update_id: 1 }),
    ).rejects.toThrow(UnauthorizedException);
    expect(updateService.handleUpdate).not.toHaveBeenCalled();
  });

  it("accepts webhook with valid secret token", async () => {
    const controller = await createController("configured-secret");

    await expect(
      controller.handleWebhook("configured-secret", { update_id: 1 }),
    ).resolves.toEqual({ ok: true });
    expect(updateService.handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });
});
