import { Injectable, Logger } from "@nestjs/common";
import { StorageService } from "./storage.service";

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(private readonly storage: StorageService) {}

  scheduleDelete(objectKeys: string[]): void {
    if (objectKeys.length === 0) {
      return;
    }

    void this.deleteWithRetry(objectKeys);
  }

  private async deleteWithRetry(
    objectKeys: string[],
    attempt = 1,
  ): Promise<void> {
    const failedKeys: string[] = [];

    for (const objectKey of objectKeys) {
      try {
        await this.storage.deleteObject(objectKey);
      } catch (error) {
        failedKeys.push(objectKey);
        this.logger.warn(
          `Failed to delete object ${objectKey} (attempt ${attempt}): ${String(error)}`,
        );
      }
    }

    if (failedKeys.length === 0) {
      return;
    }

    if (attempt >= 3) {
      this.logger.error(
        `Giving up on storage cleanup for ${failedKeys.length} object(s): ${failedKeys.join(", ")}`,
      );
      return;
    }

    const delayMs = attempt * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await this.deleteWithRetry(failedKeys, attempt + 1);
  }
}
