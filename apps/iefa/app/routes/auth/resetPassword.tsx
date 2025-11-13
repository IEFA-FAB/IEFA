// apps/iefa/app/route/auth/resetPassword.tsx

import { ResetPassword } from "@iefa/auth";

export function meta() {
    return [{ title: "Reset sua senha" }, { name: "description", content: "Altere sua senha" }];
}

export default ResetPassword;
