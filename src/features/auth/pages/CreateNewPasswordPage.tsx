import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../../../shared/components/ui/Input";
import { Button } from "../../../shared/components/ui/Button";
import { useTheme } from "../../../shared/contexts/ThemeContext";
import { supabase } from "../../../shared/utils/supabaseClient";
import * as authService from "../../../shared/services/authService";

function getStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!pw) return { score: 0, label: "", color: "" };
  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^a-zA-Z0-9]/.test(pw),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 2) return { score: 1, label: "Weak", color: "#EF4444" };
  if (score === 3) return { score: 2, label: "Medium", color: "#F97316" };
  return { score: 3, label: "Strong", color: "#22C55E" };
}

export const CreateNewPasswordPage: React.FC = () => {
  const { theme } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const navigate = useNavigate();

  const strength = getStrength(password);

  useEffect(() => {
    const checkRecoveryToken = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );

      const token =
        hashParams.get("access_token") ??
        queryParams.get("access_token") ??
        queryParams.get("token");
      const type = hashParams.get("type") ?? queryParams.get("type");

      console.log("🔑 Reset page query:", window.location.search);
      console.log("🔑 Reset page hash:", window.location.hash);
      console.log("📝 Extracted token:", token ? "found" : "not found");
      console.log("📝 Recovery type:", type);

      if (token) {
        setAccessToken(token);
        setTokenChecked(true);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session?.access_token) {
          setAccessToken(data.session.access_token);
        }
      } catch (err) {
        console.error("Error checking Supabase session for recovery:", err);
      } finally {
        setTokenChecked(true);
      }
    };

    checkRecoveryToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password =
        "Password must contain at least one uppercase letter.";
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = "Password must contain at least one number.";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    if (!accessToken) {
      newErrors.confirmPassword =
        "Reset link is invalid or expired. Please request a new one.";
    }

    if (!tokenChecked) {
      newErrors.confirmPassword = "Checking reset token... please wait.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);
    console.log("🔄 Submitting password reset with token...");
    const result = await authService.resetPassword(
      accessToken as string,
      password,
    );
    setIsLoading(false);

    if (result.success) {
      console.log("✅ Password reset successful");
    } else {
      console.error("❌ Password reset failed:", result.error);
    }

    if (result.success) {
      navigate("/signin");
    } else {
      setErrors({
        confirmPassword:
          result.error ??
          "Failed to reset password. Please request a new reset link.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] dark:bg-[#0f172a] px-4 transition-colors">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1e293b] shadow-lg border border-gray-100 dark:border-white/10 p-10 transition-colors">
        <h1 className="text-4xl font-medium text-gray-800 dark:text-gray-100 select-none">
          Create new password
        </h1>
        <p className="mt-2 text-base text-gray-500 dark:text-gray-400 select-none">
          Enter your new password below
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 select-none">
          <div>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="New Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.password;
                    return n;
                  });
                }
              }}
              error={errors.password}
              disabled={isLoading}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />
            {password && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3].map((level) => (
                    <div
                      key={level}
                      className="h-1 flex-1 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor:
                          strength.score >= level
                            ? strength.color
                            : theme === "dark"
                              ? "#334155"
                              : "#E5E7EB",
                      }}
                    />
                  ))}
                </div>
                <p
                  className="text-xs mt-0.5 font-medium"
                  style={{ color: strength.color }}
                >
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          <Input
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) {
                setErrors((prev) => {
                  const n = { ...prev };
                  delete n.confirmPassword;
                  return n;
                });
              }
            }}
            error={errors.confirmPassword}
            disabled={isLoading}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none cursor-pointer"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-4"
            isLoading={isLoading}
          >
            Reset Password
          </Button>
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => navigate("/signin")}
              className="text-sm text-primary hover:text-primary-dark transition-colors cursor-pointer font-normal"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
