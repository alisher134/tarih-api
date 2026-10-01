import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"; // Assuming JWT is used

@Controller("drm")
export class DrmController {
  // This endpoint issues the DRM keys (ClearKey)
  @Post("license")
  @UseGuards(JwtAuthGuard) // Only authenticated users can request keys
  getLicense(@Body() body: any, @Req() req: any) {
    // Shaka Player sends a payload containing 'kids' (Key IDs)
    const { kids } = body;
    if (!kids || !Array.isArray(kids)) {
      throw new UnauthorizedException("Invalid license request");
    }

    // In a real production app, you would check if the user (req.user)
    // has bought the course/lesson before giving them the key.

    // We will use a hardcoded Key for simplicity.
    // Key ID (KID) = "31323334353637383930313233343536" (Hex) -> "MTIzNDU2Nzg5MDEyMzQ1Ng" (Base64URL)
    // Key = "31323334353637383930313233343536" (Hex) -> "MTIzNDU2Nzg5MDEyMzQ1Ng" (Base64URL)

    const keys = kids.map((kid) => {
      // Return the base64url encoded key for this specific Key ID
      // If you have multiple videos with different keys, query them from DB here.
      return {
        kty: "oct", // octet sequence
        k: "MTIzNDU2Nzg5MDEyMzQ1Ng", // The symmetric key
        kid: kid, // The key ID requested
      };
    });

    return {
      keys,
      type: "temporary",
    };
  }
}
