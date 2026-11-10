import React, { useEffect, useState } from 'react';
import { Camera, Globe, Lock, LogOut, UserRound } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

export const SettingsView: React.FC = () => {
  const { currentUser, openUserProfile, signOut, refreshUserData, showToast } = useApp();
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [followRequests, setFollowRequests] = useState<Array<{ id: string; createdAt: string; user: { id: string; username: string; name: string; avatar: string; bio?: string } }>>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);

  const loadFollowRequests = async () => {
    setRequestsLoading(true);
    try {
      const result = await api.getIncomingFollowRequests();
      setFollowRequests(result.requests);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load follow requests.', 'error');
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    void loadFollowRequests();
  }, []);

  const changePrivacy = async (isPrivate: boolean) => {
    if (!currentUser || currentUser.isPrivate === isPrivate || isSavingPrivacy) return;
    const nextLabel = isPrivate ? 'Private' : 'Public';
    const confirmed = window.confirm(
      isPrivate
        ? 'Switch to a private account? Existing followers will keep access, while new followers will need your approval.'
        : 'Switch to a public account? Anyone will be able to view your posts and reels.'
    );
    if (!confirmed) return;
    setIsSavingPrivacy(true);
    try {
      await api.updateMyProfile({ isPrivate });
      await refreshUserData();
      showToast(`Your account is now ${nextLabel.toLowerCase()}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update account privacy.', 'error');
    } finally {
      setIsSavingPrivacy(false);
    }
  };

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

      {currentUser && (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-300"><Lock className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-white">Privacy</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">Choose who can see your posts and reels. Your existing approved followers are retained when you switch to private.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isSavingPrivacy}
              onClick={() => void changePrivacy(false)}
              aria-pressed={!currentUser.isPrivate}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${!currentUser.isPrivate ? 'border-rose-400/60 bg-rose-500/10' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'} disabled:opacity-50`}
            >
              <Globe className="h-5 w-5 text-emerald-300" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">Public account</span><span className="mt-1 block text-[11px] text-zinc-400">Anyone can view your posts and reels.</span></span>
              {!currentUser.isPrivate && <span className="text-[10px] font-bold text-emerald-300">Current</span>}
            </button>
            <button
              type="button"
              disabled={isSavingPrivacy}
              onClick={() => void changePrivacy(true)}
              aria-pressed={currentUser.isPrivate}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${currentUser.isPrivate ? 'border-rose-400/60 bg-rose-500/10' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'} disabled:opacity-50`}
            >
              <Lock className="h-5 w-5 text-amber-300" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">Private account</span><span className="mt-1 block text-[11px] text-zinc-400">Only approved followers can view your posts and reels.</span></span>
              {currentUser.isPrivate && <span className="text-[10px] font-bold text-emerald-300">Current</span>}
            </button>
          </div>
          {isSavingPrivacy && <p className="mt-3 text-xs text-zinc-400">Updating privacy settings...</p>}
        </div>
      )}

      {currentUser?.isPrivate && (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-bold text-white">Follow requests</h2><p className="mt-1 text-xs text-zinc-400">Approve people who want to follow your private account.</p></div>
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-300">{followRequests.length}</span>
          </div>
          {requestsLoading ? <p className="py-6 text-center text-xs text-zinc-400">Loading requests...</p> : followRequests.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">You have no pending follow requests.</p>
          ) : (
            <div className="mt-4 divide-y divide-zinc-800">
              {followRequests.map((request) => (
                <div key={request.id} className="flex items-center gap-3 py-3">
                  {request.user.avatar ? <img src={request.user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-white">{request.user.name.slice(0,1)}</span>}
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{request.user.name}</p><p className="truncate text-[11px] text-zinc-500">@{request.user.username}</p></div>
                  <button type="button" disabled={requestBusyId === request.id} onClick={async () => {
                    setRequestBusyId(request.id);
                    try { await api.respondToFollowRequest(request.id, 'reject'); setFollowRequests(items => items.filter(item => item.id !== request.id)); }
                    catch (error) { showToast(error instanceof Error ? error.message : 'Could not reject request.', 'error'); }
                    finally { setRequestBusyId(null); }
                  }} className="rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-semibold text-zinc-300 disabled:opacity-50">Reject</button>
                  <button type="button" disabled={requestBusyId === request.id} onClick={async () => {
                    setRequestBusyId(request.id);
                    try { await api.respondToFollowRequest(request.id, 'accept'); setFollowRequests(items => items.filter(item => item.id !== request.id)); showToast('Follow request accepted.', 'success'); }
                    catch (error) { showToast(error instanceof Error ? error.message : 'Could not accept request.', 'error'); }
                    finally { setRequestBusyId(null); }
                  }} className="rounded-lg bg-sky-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">Accept</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => void signOut()
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </section>
  );
};
