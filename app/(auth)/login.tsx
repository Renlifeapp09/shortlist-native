import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { PrimaryButton, FieldInput } from "../../components/shared";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isDisabled = email.trim() === "" || password.trim() === "" || isLoading;

  const handleSignIn = async () => {
    Keyboard.dismiss();
    setIsLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setErrorMessage("Incorrect email or password. Please try again.");
      } else {
        setErrorMessage(error.message);
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMessage("Enter your email above first, then tap Forgot password.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage("Password reset email sent. Check your inbox.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Top content */}
            <View style={styles.content}>
              <Text style={styles.heading}>
                Welcome{"\n"}back.
              </Text>
              <Text style={styles.subheading}>Sign in to your account</Text>

              <View style={{ gap: 20 }}>
                <FieldInput
                  label="EMAIL"
                  value={email}
                  onChange={setEmail}
                  placeholder="kristen@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <FieldInput
                  label="PASSWORD"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••••"
                  secureTextEntry
                />
              </View>

              {errorMessage !== "" && (
                <Text style={styles.error}>{errorMessage}</Text>
              )}

              <TouchableOpacity onPress={handleForgotPassword} style={{ marginTop: 12 }}>
                <Text style={styles.forgot}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Sign in button right below the fields */}
              <View style={{ marginTop: 40 }}>
                <PrimaryButton
                  label={isLoading ? "Signing in…" : "Sign in"}
                  onPress={handleSignIn}
                  disabled={isDisabled}
                />

                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <Text style={styles.newHere}>NEW HERE?</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.createText}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
                      <Text style={styles.createLink}>Create one</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#faf9f7",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 56,
    fontWeight: "300",
    lineHeight: 59,
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subheading: {
    fontWeight: "300",
    fontSize: 14,
    color: "#8b7d6b",
    marginBottom: 36,
  },
  error: {
    fontWeight: "400",
    fontSize: 13,
    color: "#c0392b",
    marginTop: 12,
  },
  forgot: {
    fontWeight: "300",
    fontSize: 13,
    color: "#8b7d6b",
  },
  newHere: {
    fontWeight: "400",
    fontSize: 10,
    letterSpacing: 2,
    color: "#8b7d6b",
    marginBottom: 4,
  },
  createText: {
    fontWeight: "300",
    fontSize: 13,
    color: "#8b7d6b",
  },
  createLink: {
    fontWeight: "400",
    fontSize: 13,
    color: "#1a1a1a",
    textDecorationLine: "underline",
  },
});
