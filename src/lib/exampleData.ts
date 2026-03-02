export const EXAMPLE_CMD = `
; The CMD file handles command definitions and state entry.
[Command]
name = "highjump"
command = $D, U
time = 15

[Command]
name = "hadoken"
command = ~D, DF, F, x
time = 15

[Statedef -1]
; Basic attack
[State -1, Stand Light Punch]
type = ChangeState
value = 200
triggerall = command = "x"
triggerall = command != "holddown"
trigger1 = statetype = S
trigger1 = ctrl

; Special Move
[State -1, Hadoken]
type = ChangeState
value = 1000
triggerall = command = "hadoken"
trigger1 = statetype = S
trigger1 = ctrl
`;

export const EXAMPLE_CNS = `
; The CNS file handles character constants and states.
[Data]
life = 1000
power = 3000
attack = 100
defence = 100
fall.defence_up = 50
liedown.time = 60
airjuggle = 15
sparkno = 2
guard.sparkno = 40
KO.echo = 0
volume = 0
IntPersistIndex = 60
FloatPersistIndex = 40

[Size]
xscale = 1
yscale = 1
ground.back = 15
ground.front = 16
air.back = 12
air.front = 12
height = 60
attack.dist = 160
proj.attack.dist = 90
proj.doscale = 0
head.pos = -5, -90
mid.pos = -5, -60
shadowoffset = 0
draw.offset = 0,0

[Velocity]
walk.fwd  = 2.4
walk.back = -2.2
run.fwd  = 4.6, 0
run.back = -4.5,-3.8
jump.neu = 0,-8.4
jump.back = -2.55
jump.fwd = 2.5

[Movement]
airjump.num = 1
airjump.height = 35
yaccel = .44
stand.friction = .85
crouch.friction = .82

;---------------------------------------------------------------------------
; Standing Light Punch
[Statedef 200]
type    = S
movetype= A
physics = S
juggle  = 1
velset = 0,0
ctrl = 0
anim = 200
poweradd = 20
sprpriority = 2

[State 200, 1]
type = HitDef
trigger1 = Time = 0
attr = S, NA
damage = 23, 0
animtype = Light
guardflag = MA
hitflag = MAF
priority = 3, Hit
pausetime = 8, 8
sparkno = 0
sparkxy = -10, -76
hitsound = 5, 0
guardsound = 6, 0
ground.type = High
ground.slidetime = 12
ground.hittime  = 15
ground.velocity = -5
air.velocity = -2.2,-3.2

[State 200, 5]
type = ChangeState
trigger1 = AnimTime = 0
value = 0
ctrl = 1

;---------------------------------------------------------------------------
; Hadoken (Fireball)
[Statedef 1000]
type    = S
movetype= A
physics = S
juggle  = 4
poweradd= -1000
velset = 0,0
anim = 1000
ctrl = 0
sprpriority = 2

[State 1000, 1]
type = Projectile
trigger1 = AnimElem = 2
projanim = 1005
projhitanim = 1006
projpriority = 1
projheightbound = -240, 100
projedgebound = 100
projscreenbound = 100
projshadow = -1
offset = 25,-55
velocity = 4,0
attr = S, SP
damage   = 70,10
animtype = Medium
guardflag = MA
hitflag = MAF
pausetime = 10,10
hitsound   = 5,2
guardsound = 6,0
ground.type = Low
ground.slidetime = 14
ground.hittime  = 16
ground.velocity = -8
air.velocity = -2.5,-5
`;
