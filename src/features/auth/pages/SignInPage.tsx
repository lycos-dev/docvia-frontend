import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { SignInForm } from '../components/SignInForm';
import type { SignInFormData } from '../types';
import { motion } from 'framer-motion';
import { useAuth } from '../../../shared/contexts/AuthContext';

export const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hashParams.get('access_token') ?? queryParams.get('access_token') ?? queryParams.get('token');
    const type = hashParams.get('type') ?? queryParams.get('type');

    if (token && type === 'recovery') {
      navigate(`/create-new-password${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [navigate]);

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    setError(undefined);
    const result = await login(data.email, data.password);
    setIsLoading(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error ?? 'Sign in failed. Please try again.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeIn' }}
      className="min-h-screen w-full bg-[#F5F5F5] dark:bg-[#0f172a] flex items-center justify-center p-4 transition-colors"
    >
      <div className="w-full max-w-lg">
        <div className="bg-white dark:bg-[#1e293b] border border-gray-100 dark:border-white/10 rounded-3xl shadow-lg px-12 py-12 select-none transition-colors">
          <Logo />
          <div className="text-center mb-8">
            <h1 className="text-[35px] text-gray-800 dark:text-gray-100 font-medium mb-2 tracking-normal leading-tight select-none">
              Welcome to Docvia
            </h1>
            <p className="text-[15px] text-gray-500 dark:text-gray-400 font-normal select-none">
              Turn reading into progress.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-500 text-center mb-4">{error}</p>
          )}
          <SignInForm
            onSubmit={handleSignIn}
            onSignUpClick={() => navigate('/signup')}
            onForgotPasswordClick={() => navigate('/forgot-password')}
            isLoading={isLoading}
          />
        </div>
      </div>
    </motion.div>
  );
};
