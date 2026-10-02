import {
  Controller,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

type LicenseRequestBody = {
  kids?: unknown[];
};

@Controller("drm")
export class DrmController {
  // This endpoint issues the DRM keys (ClearKey)
  @Post("license")
  @UseGuards(JwtAuthGuard) // Only authenticated users can request keys
  getLicense(@Body() body: LicenseRequestBody) {
    // Shaka Player sends a payload containing 'kids' (Key IDs)
    const { kids } = body;
    if (!kids || !Array.isArray(kids)) {
      throw new UnauthorizedException("Invalid license request");
    }

    // In a real production app, you would check if the user
    // has bought the course/lesson before giving them the key.

    // Key ID (KID) = "31323334353637383930313233343536" (Hex) -> "MTIzNDU2Nzg5MDEyMzQ1Ng" (Base64URL)
    // Key = "31323334353637383930313233343536" (Hex) -> "MTIzNDU2Nzg5MDEyMzQ1Ng" (Base64URL)

    const keys = kids.map((kid) => {
      return {
        kty: "oct", // octet sequence
        k: "MTIzNDU2Nzg5MDEyMzQ1Ng", // The symmetric key
        kid: typeof kid === "string" ? kid : String(kid), // The key ID requested
      };
    });

    return {
      keys,
      type: "temporary",
    };
  }
}
