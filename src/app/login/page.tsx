"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}

export default function LoginPage() {
  const [signInState, signInAction] = useActionState(signIn, initialState);
  const [signUpState, signUpAction] = useActionState(signUp, initialState);

  return (
    <div className="flex flex-1 flex-col p-10">
      <div className="w-full max-w-sm">
        <div className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold">Sequen</h1>
          <p className="mt-1 text-sm text-muted-foreground">AI-native project scheduling</p>
        </div>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <form action={signInAction} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" name="password" type="password" required autoComplete="current-password" />
              </div>
              {signInState.error && (
                <p className="text-sm text-status-off-track">{signInState.error}</p>
              )}
              <SubmitButton>Sign in</SubmitButton>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form action={signUpAction} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" name="password" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              {signUpState.error && (
                <p className="text-sm text-status-off-track">{signUpState.error}</p>
              )}
              <SubmitButton>Create account</SubmitButton>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
