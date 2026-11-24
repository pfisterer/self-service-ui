// What the caller may do with a zone they own, as the server decides it: the creator (or a super admin) deletes the zone, removes other owners and rotates every owner's key; any other owner only leaves and rotates their own key. The creator cannot leave — they delete instead. Whoever holds the zone through a group (the zone is shared with a group they are in) may delete it too, but cannot leave or be removed on their own: their access follows the group and the group share. The UI only hides what the server would refuse; the server stays the one that enforces it.
//
// `me` is the identity the requests act as (GET /v1/me, so acting for somebody counts as being them). A zone without a creator (a server from before the creator existed) is treated as before: every owner manages it. Which owners hold the zone through which group comes as `owners_via` (zone list) or `via` (a single zone, a map); in the list `via` is the caller's own group.
export function zoneAuthority({ owners = [], creator = '', via, owners_via: ownersViaList } = {}, me = '', superAdmin = false) {
    const self = (me || '').toLowerCase();
    const ownersVia = ownersViaList ?? (via && typeof via === 'object' ? via : {});
    const myGroup = ownersVia[self] || (typeof via === 'string' ? via : '') || '';
    const isCreator = !!creator && creator.toLowerCase() === self;
    const manages = superAdmin || isCreator || !creator;
    const throughGroup = (owner) => !!ownersVia[(owner || '').toLowerCase()];
    return {
        isCreator,
        manages,
        // The group the caller holds the zone through, '' when it is theirs in their own right.
        viaGroup: myGroup,
        throughGroup,
        // Deleting: whoever manages the zone, and whoever holds it through a group.
        canDelete: manages || !!myGroup,
        // Leaving needs somebody else to stay behind, and is not for the creator nor for a group member (their access follows the group).
        canLeave: !isCreator && !myGroup && owners.length > 1 && owners.some(o => o.toLowerCase() === self),
        // Removing an owner other than oneself; oneself goes through leaving. An owner through a group goes with the group share.
        canRemove: (owner) => manages && owner.toLowerCase() !== self && owners.length > 1 && !throughGroup(owner),
        // Rotating everybody's key only means something when there is somebody else.
        rotatesAll: manages && owners.length > 1,
    };
}
