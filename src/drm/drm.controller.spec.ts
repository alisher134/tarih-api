jest.mock("@nestjs/passport", () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

import { Test, TestingModule } from "@nestjs/testing";
import { DrmController } from "./drm.controller";

describe("DrmController", () => {
  let controller: DrmController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DrmController],
    }).compile();

    controller = module.get<DrmController>(DrmController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
