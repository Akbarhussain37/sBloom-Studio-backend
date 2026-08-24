BEGIN;

-- 1. NARROW OPERATIONAL TABLE PRIVILEGES
REVOKE ALL
ON TABLE public.production_work_items_studio
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
ON TABLE public.production_work_items_studio
TO service_role;

REVOKE ALL
ON TABLE public.production_events_studio
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
ON TABLE public.production_events_studio
TO service_role;


-- 2. CREATE ACCESS STATUS RPC
CREATE FUNCTION public.sbloom_set_submission_access_status(
    p_submission_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor_role TEXT;
    v_submission_record RECORD;
BEGIN
    -- 1. Verify actor inside RPC
    SELECT role INTO v_actor_role
    FROM public.profile_studio
    WHERE id = p_actor_user_id;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'production_staff') THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'STAFF_REQUIRED');
    END IF;

    -- 2. Validate access status target
    IF p_new_status IS NULL OR p_new_status NOT IN ('ACCESS_CONFIRMED', 'ACCESS_REQUIRED') THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_ACCESS_STATUS');
    END IF;

    -- 3. Lock submission row
    SELECT id, access_status INTO v_submission_record
    FROM public.production_submissions_studio
    WHERE id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'SUBMISSION_NOT_FOUND');
    END IF;

    -- 4. Access status transitions (Idempotency)
    IF v_submission_record.access_status = p_new_status THEN
        RETURN jsonb_build_object(
            'ok', true,
            'changed', false,
            'submission_id', p_submission_id,
            'access_status', p_new_status
        );
    END IF;

    -- 5. Access status mutation
    UPDATE public.production_submissions_studio
    SET access_status = p_new_status
    WHERE id = p_submission_id;

    -- 6. Access status event
    INSERT INTO public.production_events_studio (
        submission_id,
        work_item_id,
        actor_user_id,
        actor_role,
        event_type,
        from_status,
        to_status,
        metadata
    ) VALUES (
        p_submission_id,
        NULL,
        p_actor_user_id,
        v_actor_role,
        'SOURCE_ACCESS_STATUS_CHANGED',
        v_submission_record.access_status,
        p_new_status,
        '{}'::jsonb
    );

    -- 7. Access RPC Return
    RETURN jsonb_build_object(
        'ok', true,
        'changed', true,
        'submission_id', p_submission_id,
        'access_status', p_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sbloom_set_submission_access_status(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sbloom_set_submission_access_status(UUID, TEXT, UUID) TO service_role;


-- 3. CREATE ACCEPTANCE RPC
CREATE FUNCTION public.sbloom_accept_production_submission(
    p_submission_id UUID,
    p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor_role TEXT;
    v_submission_record RECORD;
    v_work_item_record RECORD;
BEGIN
    -- 1. Verify actor
    SELECT role INTO v_actor_role
    FROM public.profile_studio
    WHERE id = p_actor_user_id;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'production_staff') THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'STAFF_REQUIRED');
    END IF;

    -- 2. Lock submission
    SELECT id, access_status INTO v_submission_record
    FROM public.production_submissions_studio
    WHERE id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'SUBMISSION_NOT_FOUND');
    END IF;

    -- 3. Critical Idempotency Order (Check work items BEFORE testing access_status)
    SELECT id, submission_id, status, accepted_by, accepted_at INTO v_work_item_record
    FROM public.production_work_items_studio
    WHERE submission_id = p_submission_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', true,
            'created', false,
            'work_item', jsonb_build_object(
                'id', v_work_item_record.id,
                'submission_id', v_work_item_record.submission_id,
                'status', v_work_item_record.status,
                'accepted_by', v_work_item_record.accepted_by,
                'accepted_at', v_work_item_record.accepted_at
            )
        );
    END IF;

    -- 4. First-time acceptance requirement
    IF v_submission_record.access_status <> 'ACCESS_CONFIRMED' THEN
        RETURN jsonb_build_object('ok', false, 'error_code', 'ACCESS_NOT_CONFIRMED');
    END IF;

    -- 5. Create work item
    INSERT INTO public.production_work_items_studio (
        submission_id,
        status,
        assigned_to,
        accepted_by,
        accepted_at
    ) VALUES (
        p_submission_id,
        'QUEUED',
        NULL,
        p_actor_user_id,
        CURRENT_TIMESTAMP
    ) RETURNING id, submission_id, status, accepted_by, accepted_at INTO v_work_item_record;

    -- 6. Acceptance event
    INSERT INTO public.production_events_studio (
        submission_id,
        work_item_id,
        actor_user_id,
        actor_role,
        event_type,
        from_status,
        to_status,
        metadata
    ) VALUES (
        p_submission_id,
        v_work_item_record.id,
        p_actor_user_id,
        v_actor_role,
        'SUBMISSION_ACCEPTED',
        NULL,
        'QUEUED',
        '{}'::jsonb
    );

    -- 7. Acceptance Return
    RETURN jsonb_build_object(
        'ok', true,
        'created', true,
        'work_item', jsonb_build_object(
            'id', v_work_item_record.id,
            'submission_id', v_work_item_record.submission_id,
            'status', v_work_item_record.status,
            'accepted_by', v_work_item_record.accepted_by,
            'accepted_at', v_work_item_record.accepted_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sbloom_accept_production_submission(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sbloom_accept_production_submission(UUID, UUID) TO service_role;

COMMIT;
