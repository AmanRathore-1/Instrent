import React, { useState } from 'react';
import { Camera, LogOut, UserRound } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

export const SettingsView: React.FC = () => {
  const { currentUser, openUserProfile, signOut, refreshUserData, showToast } = useApp();
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploadingAvatar(true);
    setAvatarUploadProgress(0);
    try {
      const uploaded = await api.uploadMedia(file, 'image', setAvatarUploadProgress);
      await api.updateMyProfile({ avatarPublicId: uploaded.publicId });
      await refreshUserData();
      showToast('Profile photo updated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update profile photo.', 'error');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarUploadProgress(0);
    }
  };

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-white">Account</h1>
      <p className="mt-1 text-xs text-zinc-400">Manage your profile and sign-in session.</p>

      {currentUser && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold text-white">
              {currentUser.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{currentUser.name}</p>
            <p className="truncate text-xs text-zinc-400">@{currentUser.username}</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800 aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
              <Camera className="h-3.5 w-3.5" />
              {isUploadingAvatar ? `Uploading ${avatarUploadProgress}%` : 'Change photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={isUploadingAvatar}
                onChange={(event) => void handleAvatarChange(event)}
                className="sr-only"
              />
            </label>
          </div>
          <button
            onClick={() => openUserProfile(currentUser.username)}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
          >
            <UserRound className="h-4 w-4" />
            Profile
          </button>
        </div>
      )}

      <button
        onClick={() => void signOut()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </section>
  );
};
